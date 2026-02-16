SHELL := bash
.ONESHELL:

SRC ?= media-source
DEST ?= content/media
MAX_DIMENSION ?= 1080
CRF_HEVC ?= 28
POSTER_TIME ?= 0.5
FORCE ?= 0
QUIET ?= 0
PYTHON_BIN ?= python3
FFMPEG_BIN ?= ffmpeg

HQ_SUFFIX := _hq
HQ_CRF_BONUS := 8
HEVC_PRESET := slow
HEVC_AUDIO_BITRATE := 160k
AUDIO_BITRATE := 128k

.PHONY: help transcode transcode-force validate parity-verify

help:
	@echo "Media transcoding targets"
	@echo "  make transcode       # Incremental transcode to $(DEST)"
	@echo "  make transcode-force # Re-encode all supported media"
	@echo "  make validate        # Build + run validate_output.py"
	@echo "  make parity-verify   # Compare python vs make outputs"
	@echo "  (set PYTHON_BIN=python3 or equivalent interpreter if needed)"
	@echo "  (set FFMPEG_BIN=ffmpeg or explicit ffmpeg executable path)"

transcode:
	@if [[ "$(FFMPEG_BIN)" == *"/"* || "$(FFMPEG_BIN)" == *"\\"* ]]; then \
		[[ -x "$(FFMPEG_BIN)" ]] || { echo "[ERROR] ffmpeg executable not found: $(FFMPEG_BIN)" >&2; exit 1; }; \
	else \
		command -v "$(FFMPEG_BIN)" >/dev/null 2>&1 || { echo "[ERROR] Required tool '$(FFMPEG_BIN)' not found in PATH." >&2; exit 1; }; \
	fi

	src_root="$(SRC)"
	dest_root="$(DEST)"
	max_dimension="$(MAX_DIMENSION)"
	crf_hevc_default="$(CRF_HEVC)"
	poster_time="$(POSTER_TIME)"
	force="$(FORCE)"
	quiet="$(QUIET)"
	hq_suffix="$(HQ_SUFFIX)"
	hq_bonus="$(HQ_CRF_BONUS)"
	hevc_preset="$(HEVC_PRESET)"
	hevc_audio_bitrate="$(HEVC_AUDIO_BITRATE)"
	audio_bitrate="$(AUDIO_BITRATE)"
	ffmpeg_bin="$(FFMPEG_BIN)"

	build_scale_filter() {
		echo "scale='if(gt(iw,ih),min($${max_dimension},iw),-2)':'if(gt(ih,iw),min($${max_dimension},ih),-2)'"
	}

	is_video_ext() {
		case "$${1}" in
			mp4|mov|mkv|avi|webm|m4v|gif) return 0 ;;
			*) return 1 ;;
		esac
	}

	is_image_ext() {
		case "$${1}" in
			jpg|jpeg|png|bmp|tiff|tif|webp) return 0 ;;
			*) return 1 ;;
		esac
	}

	is_audio_ext() {
		case "$${1}" in
			wav|flac|m4a|mp3|ogg|mta|qta) return 0 ;;
			*) return 1 ;;
		esac
	}

	is_heic_ext() {
		case "$${1}" in
			heic|heif) return 0 ;;
			*) return 1 ;;
		esac
	}

	if [[ ! -d "$${src_root}" ]]; then
		echo "[INFO] Source directory '$${src_root}' does not exist. Creating it."
		mkdir -p "$${src_root}"
		echo "Drop master/source videos and images there and re-run."
		exit 0
	fi

	declare -a sources=()
	while IFS= read -r -d '' src_file; do
		filename="$${src_file##*/}"
		ext="$${filename##*.}"
		ext="$${ext,,}"
		if is_video_ext "$${ext}" || is_image_ext "$${ext}" || is_audio_ext "$${ext}" || is_heic_ext "$${ext}"; then
			sources+=("$${src_file}")
		fi
	done < <(find "$${src_root}" -type f -print0 | sort -z)

	if [[ "$${#sources[@]}" -eq 0 ]]; then
		echo "[INFO] No source media in $${src_root} (allowed: .avi, .bmp, .flac, .gif, .jpg, .jpeg, .m4a, .m4v, .mkv, .mov, .mp3, .mp4, .mta, .ogg, .png, .qta, .tif, .tiff, .wav, .webm, .webp)"
		exit 0
	fi

	mkdir -p "$${dest_root}"
	echo "============================================================="
	echo "Processing $${#sources[@]} media file(s) from $${src_root} -> $${dest_root}"
	echo "============================================================="

	vf_chain="$$(build_scale_filter)"

	for src_file in "$${sources[@]}"; do
		rel="$${src_file#"$${src_root}"/}"
		if [[ "$${rel}" == "$${src_file}" ]]; then
			rel="$${src_file}"
		fi
		filename="$${rel##*/}"
		ext="$${filename##*.}"
		ext="$${ext,,}"
		name="$${filename%.*}"
		rel_dir="$$(dirname "$${rel}")"
		[[ "$${rel_dir}" == "." ]] && rel_dir=""

		echo "[PROCESS] $${rel}"

		if is_heic_ext "$${ext}"; then
			echo "[WARN] HEIC/HEIF support removed in Makefile migration (TODO: add pre-conversion or replacement source): $${rel}"
			echo "  [DONE] $${filename}"
			continue
		fi

		if is_image_ext "$${ext}"; then
			out_dir="$${dest_root}/images"
			[[ -n "$${rel_dir}" ]] && out_dir="$${out_dir}/$${rel_dir}"
			mkdir -p "$${out_dir}"
			avif_out="$${out_dir}/$${name}.avif"

			if [[ "$${force}" != "1" && -f "$${avif_out}" ]]; then
				if [[ "$${quiet}" != "1" ]]; then
					echo "[SKIP] $${filename} (AVIF already encoded)"
				fi
			else
				rel_display="$${name}"
				[[ -n "$${rel_dir}" ]] && rel_display="$${rel_dir}/$${name}"
				proc_out="$$("$${ffmpeg_bin}" -y -i "$${src_file}" -vf "$${vf_chain}" -c:v libaom-av1 -crf 32 -b:v 0 "$${avif_out}" 2>&1)"
				status=$$?
				if [[ $$status -eq 0 ]]; then
					echo "  [IMAGE] AVIF: images/$${rel_display}.avif"
				else
					last_line="$$(printf '%s\n' "$${proc_out}" | tail -n 1)"
					[[ -z "$${last_line}" ]] && last_line="Unknown error"
					echo "[WARN] AVIF encode failed for $${filename}: $${last_line}"
				fi
			fi
			echo "  [DONE] $${filename}"
			continue
		fi

		if is_audio_ext "$${ext}"; then
			out_dir="$${dest_root}/voice"
			[[ -n "$${rel_dir}" ]] && out_dir="$${out_dir}/$${rel_dir}"
			mkdir -p "$${out_dir}"
			m4a_out="$${out_dir}/$${name}.m4a"

			if [[ "$${force}" != "1" && -f "$${m4a_out}" ]]; then
				if [[ "$${quiet}" != "1" ]]; then
					echo "[SKIP] $${filename} (audio output exists)"
				fi
			else
				rel_display="$${name}"
				[[ -n "$${rel_dir}" ]] && rel_display="$${rel_dir}/$${name}"
				echo "  [AUDIO] M4A: voice/$${rel_display}.m4a"
				proc_out="$$("$${ffmpeg_bin}" -y -i "$${src_file}" -vn -c:a aac -b:a "$${audio_bitrate}" "$${m4a_out}" 2>&1)"
				status=$$?
				if [[ $$status -ne 0 ]]; then
					last_line="$$(printf '%s\n' "$${proc_out}" | tail -n 1)"
					[[ -z "$${last_line}" ]] && last_line="Unknown error"
					echo "[WARN] Audio encode failed for $${filename}: $${last_line}"
				fi
			fi
			echo "  [DONE] $${filename}"
			continue
		fi

		if is_video_ext "$${ext}"; then
			out_dir="$${dest_root}/video"
			[[ -n "$${rel_dir}" ]] && out_dir="$${out_dir}/$${rel_dir}"
			mkdir -p "$${out_dir}"
			hevc_out="$${out_dir}/$${name}.mp4"
			poster_out="$${out_dir}/$${name}.jpg"

			if [[ "$${force}" != "1" && -f "$${hevc_out}" && -f "$${poster_out}" ]]; then
				if [[ "$${quiet}" != "1" ]]; then
					echo "[SKIP] $${filename} (video outputs exist)"
				fi
				echo "  [DONE] $${filename}"
				continue
			fi

			crf_hevc="$${crf_hevc_default}"
			lower_name="$${name,,}"
			quality_tag=""
			if [[ "$${lower_name}" == *"$${hq_suffix}" ]]; then
				crf_hevc=$$((crf_hevc - hq_bonus))
				if (( crf_hevc < 0 )); then
					crf_hevc=0
				fi
				quality_tag=" (HQ)"
			fi

			rel_display="$${name}"
			[[ -n "$${rel_dir}" ]] && rel_display="$${rel_dir}/$${name}"

			if [[ "$${force}" == "1" || ! -f "$${hevc_out}" ]]; then
				echo "  [VIDEO] HEVC$${quality_tag}: video/$${rel_display}.mp4"
				proc_out="$$("$${ffmpeg_bin}" -y -i "$${src_file}" -vf "$${vf_chain}" -c:v libx265 -preset "$${hevc_preset}" -crf "$${crf_hevc}" -pix_fmt yuv420p -tag:v hvc1 -movflags +faststart -c:a aac -b:a "$${hevc_audio_bitrate}" "$${hevc_out}" 2>&1)"
				status=$$?
				if [[ $$status -ne 0 ]]; then
					last_line="$$(printf '%s\n' "$${proc_out}" | tail -n 1)"
					[[ -z "$${last_line}" ]] && last_line="Unknown error"
					echo "[WARN] HEVC encode failed for $${filename}: $${last_line}"
				fi
			fi

			if [[ "$${force}" == "1" || ! -f "$${poster_out}" ]]; then
				echo "  [VIDEO] Poster: video/$${rel_display}.jpg"
				proc_out="$$("$${ffmpeg_bin}" -y -i "$${src_file}" -ss "$${poster_time}" -vframes 1 -vf "$${vf_chain}" "$${poster_out}" 2>&1)"
				status=$$?
				if [[ $$status -ne 0 ]]; then
					last_line="$$(printf '%s\n' "$${proc_out}" | tail -n 1)"
					[[ -z "$${last_line}" ]] && last_line="Unknown error"
					echo "[WARN] Poster extraction failed for $${filename}: $${last_line}"
				fi
			fi

			echo "  [DONE] $${filename}"
			continue
		fi

		echo "[WARN] Unknown file type: $${filename}"
		echo "  [DONE] $${filename}"
	done

	echo "============================================================="
	echo "Complete."
	echo "============================================================="

transcode-force: FORCE=1
transcode-force: transcode

validate:
	@pelican content -o output -s pelicanconf.py
	@$(PYTHON_BIN) validate_output.py

parity-verify:
	@$(PYTHON_BIN) transcode_videos.py --src "$(SRC)" --dest content/media_py_ref
	@$(MAKE) transcode SRC="$(SRC)" DEST=content/media_make_ref
	@$(PYTHON_BIN) tools/compare_media_parity.py --python-root content/media_py_ref --make-root content/media_make_ref --src-root "$(SRC)" --allow-heic-gap
