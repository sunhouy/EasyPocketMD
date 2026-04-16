// vips-worker.js - 使用 importScripts 加载独立的 vips.js

let vips = null;
let initPromise = null;
let vipsResolve = null;
let vipsReject = null;

const autoInitPromise = new Promise((resolve, reject) => {
  vipsResolve = resolve;
  vipsReject = reject;
});

self.Vips = null;
self._vipsReadyResolve = vipsResolve;

const initVips = async () => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (typeof self.Vips !== 'function') {
      importScripts('/vips.js');
      if (typeof self.Vips !== 'function') {
        throw new Error('Vips 未定义，vips.js 加载失败');
      }
    }

    vips = await self.Vips({
      mainScriptUrlOrBlob: '/vips.js',
      locateFile: (path) => {
        if (path.endsWith('.wasm')) {
          return '/vips.wasm';
        }
        return path;
      }
    });

    return vips;
  })().catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
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
    self.postMessage({ error: err.message });
  }
};
