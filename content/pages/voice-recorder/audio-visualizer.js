class AudioVisualizer {
    constructor(canvas, analyserNode) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyserNode = null;
        this.data = null;

        this.backgroundColor = 'rgba(16, 12, 20, 1)';
        this.borderColor = 'rgba(255, 107, 157, 0.65)';
        this.borderWidth = 2;

        this.setAnalyser(analyserNode);
    }

    setAnalyser(analyserNode) {
        this.analyserNode = analyserNode;
        this.data = this.analyserNode ? new Uint8Array(this.analyserNode.fftSize) : null;
    }

    paintFrame() {
        const width = this.canvas.width;
        const height = this.canvas.height;

        this.ctx.save();
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, width, height);

        if (this.borderWidth > 0) {
            const inset = this.borderWidth / 2;
            this.ctx.lineWidth = this.borderWidth;
            this.ctx.strokeStyle = this.borderColor;
            this.ctx.strokeRect(inset, inset, width - this.borderWidth, height - this.borderWidth);
        }
        this.ctx.restore();
    }

    clear() {
        this.paintFrame();
    }

    render() {
        this.paintFrame();
        if (!this.analyserNode) return;
        if (!this.data || this.data.length !== this.analyserNode.fftSize) {
            this.data = new Uint8Array(this.analyserNode.fftSize);
        }

        this.analyserNode.getByteTimeDomainData(this.data);

        const width = this.canvas.width;
        const height = this.canvas.height;
        const mid = height / 2;
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
