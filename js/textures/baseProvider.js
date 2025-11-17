/**
 * Abstract texture provider.
 */
class BaseTextureProvider {
    constructor(id, name) {
        this.id = id;
        this.name = name || id;
    }

    /**
     * Generates a texture.
     * @param {Object} options - Generation options.
     * @returns {Promise<TextureResult>}
     */
    async generateTexture(options) {
        throw new Error('generateTexture must be implemented by subclass');
    }

    /**
     * Indicates whether the provider can run in the current context.
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        return true;
    }

    /**
     * Normalizes provider-specific responses to a TextureResult.
     * @param {Object} _payload
     * @returns {TextureResult}
     */
    normalizeResponse(_payload) {
        throw new Error('normalizeResponse must be implemented by subclass');
    }

    /**
     * Returns supported capabilities (sizes, qualities, etc).
     */
    getCapabilities() {
        return {};
    }
}

/**
 * @typedef {Object} TextureResult
 * @property {boolean} success
 * @property {string} [imageUrl]
 * @property {Object} metadata
 * @property {number} metadata.width
 * @property {number} metadata.height
 * @property {string} [metadata.format]
 * @property {boolean} [metadata.seamless]
 * @property {string} [metadata.prompt]
 * @property {string} [metadata.provider]
 * @property {number} [metadata.generationTime]
 */
