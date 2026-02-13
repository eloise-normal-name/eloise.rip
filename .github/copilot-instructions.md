# Using the Makefile

The Makefile provides a streamlined and efficient way to manage different tasks, replacing the previous method using `transcode_videos.py`. Below are the commands you can use with their respective descriptions:

## Commands

### Basic Compile Command
- **`make`**: This command will build the default target defined in the Makefile. This typically includes compiling all necessary components of the project.

### Force Build
- **`make force`**: Use this command to force the build, ignoring any previously compiled files. This is useful when dependencies have changed.

### Parallel Build
- **`make -j4`**: This command builds the project using 4 parallel jobs, speeding up the compilation process if you have multiple CPU cores.

### Specific Tasks
- **`make videos`**: This targets the compilation of video files. Use this when you want to process videos specifically.
- **`make images`**: This command focuses on processing image files.
- **`make audio`**: Use this command to handle audio files during the build.

### Clean Up
- **`make clean`**: This will remove all compiled files to give you a fresh start. Use this before starting a new build.

## Summary
Using the Makefile simplifies your workflow and enhances build efficiency. Be sure to familiarize yourself with these commands to optimize your usage.