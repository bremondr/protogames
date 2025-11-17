/**
 * Mock procedural texture provider.
 */
class MockTextureProvider extends BaseTextureProvider {
    constructor() {
        super('mock', 'Mock (Procedural)');
    }

    async generateTexture(options) {
        const start = performance.now();
        await new Promise((res) => setTimeout(res, 800));
        const { width = 512, height = 512, prompt = '', baseColor = '#999' } = options || {};
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        this.fillGradient(ctx, width, height, baseColor);
        this.addNoise(ctx, width, height);
        this.addPattern(ctx, width, height, prompt);

        const imageUrl = canvas.toDataURL('image/png');
        const end = performance.now();
        return {
            success: true,
            imageUrl,
            metadata: {
                width,
                height,
                format: 'png',
                seamless: true,
                prompt,
                provider: this.id,
                generationTime: end - start
            }
        };
    }

    fillGradient(ctx, width, height, baseColor) {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, this.tint(baseColor, 0.15));
        gradient.addColorStop(1, this.tint(baseColor, -0.1));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    addNoise(ctx, width, height) {
        const noiseDensity = 0.08;
        const count = Math.floor(width * height * noiseDensity * 0.01);
        ctx.globalAlpha = 0.12;
        for (let i = 0; i < count; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 2 + 0.5;
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)';
            ctx.fillRect(x, y, size, size);
        }
        ctx.globalAlpha = 1;
    }

    addPattern(ctx, width, height, prompt) {
        const lower = prompt.toLowerCase();
        if (lower.includes('water')) {
            this.drawWaves(ctx, width, height);
        } else if (lower.includes('stone') || lower.includes('mountain')) {
            this.drawCracks(ctx, width, height);
        } else if (lower.includes('sand') || lower.includes('desert')) {
            this.drawDots(ctx, width, height);
        } else {
            this.drawDots(ctx, width, height);
        }
    }

    drawWaves(ctx, width, height) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5;
        const rows = 12;
        for (let r = 0; r < rows; r++) {
            const y = (r / rows) * height + Math.random() * 6;
            ctx.beginPath();
            for (let x = 0; x <= width; x += 12) {
                const offset = Math.sin((x / width) * Math.PI * 2 + r) * 4;
                ctx.lineTo(x, y + offset);
            }
            ctx.stroke();
        }
    }

    drawCracks(ctx, width, height) {
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1;
        const lines = 30;
        for (let i = 0; i < lines; i++) {
            let x = Math.random() * width;
            let y = Math.random() * height;
            ctx.beginPath();
            ctx.moveTo(x, y);
            const segments = 12;
            for (let s = 0; s < segments; s++) {
                x += Math.random() * 20 - 10;
                y += Math.random() * 20 - 10;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }

    drawDots(ctx, width, height) {
        const count = Math.floor(width * height * 0.002);
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let i = 0; i < count; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const r = Math.random() * 1.5 + 0.5;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    tint(color, amount) {
        const c = this.hexToRgb(color);
        if (!c) return color;
        const t = (v) => Math.max(0, Math.min(255, Math.floor(v + 255 * amount)));
        return `rgb(${t(c.r)}, ${t(c.g)}, ${t(c.b)})`;
    }

    hexToRgb(hex) {
        const cleaned = hex.replace('#', '');
        if (![3, 6].includes(cleaned.length)) return null;
        const bigint = parseInt(cleaned.length === 3 ? cleaned.repeat(2) : cleaned, 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255
        };
    }
}
