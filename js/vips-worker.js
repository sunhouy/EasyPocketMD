importScripts('/wasm-vips/vips.js');

let vips = null;

const initVips = async () => {
  if (vips) return vips;

  if (typeof self.Vips !== 'function') {
    throw new Error('Failed to load wasm-vips: Vips is not defined');
  }

  vips = await self.Vips({
    locateFile: (path) => {
      if (path.endsWith('.wasm')) {
        return '/wasm-vips/vips.wasm';
      }
      return path;
    }
  });

  return vips;
};

self.onmessage = async (e) => {
  const data = e.data;

  if (data.warmup) {
    try {
      await initVips();
      self.postMessage({ ready: true });
    } catch (err) {
      self.postMessage({ error: 'Warmup failed: ' + err.message });
    }
    return;
  }

  const { fileBuffer, fileName, quality = 75, maxDimension = 4096 } = data;
  
  try {
    const vipsInstance = await initVips();

    let image = vipsInstance.Image.newFromBuffer(fileBuffer, '');

    const origWidth = image.width;
    const origHeight = image.height;

    if (image.width > maxDimension || image.height > maxDimension) {
      const scale = maxDimension / Math.max(image.width, image.height);
      image = image.resize(scale);
    }

    const compressedBuffer = image.writeToBuffer(`.jpg[Q=${quality},strip]`);

    self.postMessage({
      processedBuffer: compressedBuffer,
      fileName: fileName.replace(/\.[^/.]+$/, '') + '.jpg',
      originalWidth: origWidth,
      originalHeight: origHeight
    }, [compressedBuffer.buffer]);

    image.delete();
  } catch (err) {
    console.error('Vips 处理失败:', err);
    self.postMessage({ error: err.message });
  }
};
