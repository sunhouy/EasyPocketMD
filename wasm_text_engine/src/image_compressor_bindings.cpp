#ifdef __EMSCRIPTEN__

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "image_compressor.h"

using namespace emscripten;

static std::vector<uint8_t> valToVector(const val& v) {
    size_t len = v["length"].as<size_t>();
    std::vector<uint8_t> result(len);
    for (size_t i = 0; i < len; ++i) {
        result[i] = v[i].as<uint8_t>();
    }
    return result;
}

static val vectorToVal(const std::vector<uint8_t>& v) {
    val result = val::global("Uint8Array").new_(v.size());
    val uint8Array = result.as<val>();
    for (size_t i = 0; i < v.size(); ++i) {
        uint8Array.set(i, v[i]);
    }
    return result;
}

EMSCRIPTEN_BINDINGS(image_compressor_module) {
    value_object<ImageCompressor::CompressOptions>("CompressOptions")
        .field("quality", &ImageCompressor::CompressOptions::quality)
        .field("maxWidth", &ImageCompressor::CompressOptions::maxWidth)
        .field("maxHeight", &ImageCompressor::CompressOptions::maxHeight)
        .field("preserveAspectRatio", &ImageCompressor::CompressOptions::preserveAspectRatio);

    value_object<ImageCompressor::CompressResult>("CompressResult")
        .field("data", &ImageCompressor::CompressResult::data)
        .field("width", &ImageCompressor::CompressResult::width)
        .field("height", &ImageCompressor::CompressResult::height)
        .field("channels", &ImageCompressor::CompressResult::channels)
        .field("success", &ImageCompressor::CompressResult::success)
        .field("error", &ImageCompressor::CompressResult::error)
        .field("originalSize", &ImageCompressor::CompressResult::originalSize)
        .field("compressedSize", &ImageCompressor::CompressResult::compressedSize);

    function("compressImage", optional_override([](val imageData, int width, int height, int channels, int quality, int maxWidth) -> val {
        static ImageCompressor compressor;
        ImageCompressor::CompressOptions opts;
        opts.quality = quality;
        opts.maxWidth = maxWidth;
        opts.maxHeight = 0;
        opts.preserveAspectRatio = true;

        auto data = valToVector(imageData);
        auto result = compressor.compress(data.data(), width, height, channels, opts);

        val jsResult = val::object();
        if (result.success) {
            jsResult.set("data", vectorToVal(result.data));
        }
        jsResult.set("width", result.width);
        jsResult.set("height", result.height);
        jsResult.set("channels", result.channels);
        jsResult.set("success", result.success);
        jsResult.set("error", result.error);
        jsResult.set("originalSize", result.originalSize);
        jsResult.set("compressedSize", result.compressedSize);
        return jsResult;
    }));

    function("encodeImage", optional_override([](val rgbaData, int width, int height, int channels, const std::string& format, int quality) -> val {
        static ImageCompressor compressor;
        auto data = valToVector(rgbaData);

        std::vector<uint8_t> encoded;
        if (format == "jpeg" || format == "jpg") {
            encoded = compressor.encodeJpeg(data.data(), width, height, quality);
        } else if (format == "png") {
            encoded = compressor.encodePng(data.data(), width, height, channels);
        } else {
            encoded = compressor.encodeJpeg(data.data(), width, height, quality);
        }

        val jsResult = val::object();
        if (!encoded.empty()) {
            jsResult.set("data", vectorToVal(encoded));
            jsResult.set("success", true);
        } else {
            jsResult.set("success", false);
            jsResult.set("error", "Encoding failed");
        }
        return jsResult;
    }));

    function("decodeImage", optional_override([](val rawData, const std::string& format) -> val {
        static ImageCompressor compressor;
        auto data = valToVector(rawData);

        int w = 0, h = 0, c = 0;
        std::vector<uint8_t> decoded;

        if (format == "jpeg" || format == "jpg") {
            decoded = compressor.decodeJpeg(data.data(), data.size(), w, h, c);
        } else if (format == "png") {
            decoded = compressor.decodePng(data.data(), data.size(), w, h, c);
        } else {
            decoded = compressor.decodeJpeg(data.data(), data.size(), w, h, c);
        }

        val jsResult = val::object();
        if (!decoded.empty()) {
            jsResult.set("data", vectorToVal(decoded));
            jsResult.set("width", w);
            jsResult.set("height", h);
            jsResult.set("channels", c);
            jsResult.set("success", true);
        } else {
            jsResult.set("success", false);
            jsResult.set("error", "Decoding failed");
        }
        return jsResult;
    }));
}

#endif