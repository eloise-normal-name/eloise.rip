// AudioVisualizer class for voice recorder visualization
class AudioVisualizer {
    constructor(analyserNode, config) {
        this.analyserNode = analyserNode;
        this.config = config;
        this.audioData = [];
        this.smoothedAudioData = [];
    }

    update(frameCount) {
        if (!this.analyserNode) return;
        const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
        this.analyserNode.getByteFrequencyData(dataArray);
        const rms = Math.sqrt(dataArray.reduce((sum, value) => sum + value * value, 0) / dataArray.length);
        const normalized = Math.min(1.0, rms / 128);
        this.audioData[frameCount] = normalized;
    }

    draw(ctx, canvas, progress, frameCount = 0) {
        const duration = progress * this.config.MAX_DURATION;
        const barCount = Math.max(5, Math.floor(duration / 0.05));
        const barWidth = canvas.width / barCount;
        const progressPosition = progress * barCount;

        const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        bgGradient.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        for (let i = 0; i < barCount; i += 1) {
            const x = i * barWidth;
            const isFilled = i < progressPosition;
            let audioIntensity = 0.08;
            if (this.audioData.length > 0) {
                const framePerBar = Math.max(1, Math.floor(this.audioData.length / barCount));
                const index = Math.floor(i * framePerBar);
                if (index < this.audioData.length) {
                    const raw = Math.min(1.0, this.audioData[index] * 1.1);
                    const scaled = Math.max(0.05, raw);
                    const previous = this.smoothedAudioData[i] ?? scaled;
                    const alpha = this.config.SMOOTHING_ALPHA;
                    audioIntensity = previous * (1 - alpha) + scaled * alpha;
                    this.smoothedAudioData[i] = audioIntensity;
                }
            }

            const maxHeight = canvas.height - 20;
            const barHeight = maxHeight * audioIntensity;
            const barY = (canvas.height - barHeight) / 2;
            const barPadding = Math.max(1, barWidth * 0.15);

            if (isFilled) {
                const baseR = 255;
                const baseG = 107;
                const baseB = 157;
                ctx.shadowBlur = 8;
                ctx.shadowColor = `rgba(${baseR}, ${baseG}, ${baseB}, 0.45)`;
            } else {
                ctx.shadowBlur = 0;
            }

            const gradient = ctx.createLinearGradient(x, barY, x, barY + barHeight);
            if (isFilled) {
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
                gradient.addColorStop(1, 'rgba(255, 107, 157, 0.95)');
            } else {
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
            }

            ctx.fillStyle = gradient;
            const barX = x + barPadding;
            const adjustedWidth = Math.max(2, barWidth - barPadding * 2);
            const radius = Math.min(6, adjustedWidth / 2);

            ctx.beginPath();
            ctx.moveTo(barX + radius, barY);
            ctx.lineTo(barX + adjustedWidth - radius, barY);
            ctx.quadraticCurveTo(barX + adjustedWidth, barY, barX + adjustedWidth, barY + radius);
            ctx.lineTo(barX + adjustedWidth, barY + barHeight - radius);
            ctx.quadraticCurveTo(barX + adjustedWidth, barY + barHeight, barX + adjustedWidth - radius, barY + barHeight);
            ctx.lineTo(barX + radius, barY + barHeight);
            ctx.quadraticCurveTo(barX, barY + barHeight, barX, barY + barHeight - radius);
            ctx.lineTo(barX, barY + radius);
            ctx.quadraticCurveTo(barX, barY, barX + radius, barY);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}
