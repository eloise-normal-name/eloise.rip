// Minimal line waveform visualizer
class AudioVisualizer {
    constructor(canvas, analyserNode) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyserNode = analyserNode;
        this.data = null;
    }

    setAnalyser(analyserNode) {
        this.analyserNode = analyserNode;
        if (this.analyserNode) {
            this.data = new Uint8Array(this.analyserNode.fftSize);
        }
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    render() {
        if (!this.analyserNode) return;
        if (!this.data || this.data.length !== this.analyserNode.fftSize) {
            this.data = new Uint8Array(this.analyserNode.fftSize);
        }

        this.analyserNode.getByteTimeDomainData(this.data);

        const width = this.canvas.width;
        const height = this.canvas.height;
        const mid = height / 2;

        this.ctx.clearRect(0, 0, width, height);
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = 'rgba(255, 107, 157, 0.9)';

        this.ctx.beginPath();
        for (let i = 0; i < this.data.length; i += 1) {
            const x = (i / (this.data.length - 1)) * width;
            const v = (this.data[i] - 128) / 128;
            const y = mid + v * (mid - 6);
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
    }
}
