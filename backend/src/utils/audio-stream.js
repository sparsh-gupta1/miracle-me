const crypto = require('crypto');
const { Readable } = require('stream');

// Helper to infer extension from MIME type
const mimeToExt = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
};

const dataUriRegex = /^\s*data:([^;]+);base64,(.+)\s*$/i;

function convertIncomingAudioToStream(input) {
  if (!input) {
    throw Object.assign(
      new Error('No input provided to convertIncomingAudioToStream'),
      { code: 'E_NO_INPUT' }
    );
  }

  // If input is a Readable stream already
  if (typeof input === 'object' && input !== null && typeof input.pipe === 'function') {
    return {
      stream: input,
      buffer: null,
      contentType: null,
      extension: null,
    };
  }

  // If input is a string: data URI or plain base64
  if (typeof input === 'string') {
    const match = input.match(dataUriRegex);
    if (match) {
      const contentType = match[1].trim();
      const base64 = match[2].replace(/\s/g, '');
      const buffer = Buffer.from(base64, 'base64');
      return {
        stream: Readable.from(buffer),
        buffer,
        contentType,
        extension: mimeToExt[contentType] || contentType.split('/').pop() || null,
      };
    }

    const plainBase64 = input.replace(/\s/g, '');
    const isLikelyBase64 = /^[A-Za-z0-9+\/=]+$/.test(plainBase64);
    if (isLikelyBase64) {
      const buffer = Buffer.from(plainBase64, 'base64');
      return {
        stream: Readable.from(buffer),
        buffer,
        contentType: null,
        extension: null,
      };
    }

    throw Object.assign(
      new Error('String input must be a base64 string or data URI'),
      { code: 'E_INVALID_INPUT' }
    );
  }

  // If input is Buffer / Uint8Array / ArrayBuffer
  if (Buffer.isBuffer(input) || input instanceof Uint8Array || input instanceof ArrayBuffer) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return {
      stream: Readable.from(buffer),
      buffer,
      contentType: null,
      extension: null,
    };
  }

  throw Object.assign(
    new Error('Unsupported input type for convertIncomingAudioToStream'),
    { code: 'E_UNSUPPORTED_INPUT' }
  );
}

function generateRandomFilename(extension = 'dat') {
  const id = crypto.randomBytes(12).toString('hex');
  return `${Date.now()}_${id}.${extension.replace(/^\.+/, '')}`;
}

module.exports = {
  convertIncomingAudioToStream,
  generateRandomFilename,
};