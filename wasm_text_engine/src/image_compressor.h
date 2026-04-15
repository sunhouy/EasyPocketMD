#ifndef WASM_TEXT_ENGINE_IMAGE_COMPRESSOR_H
#define WASM_TEXT_ENGINE_IMAGE_COMPRESSOR_H

#include <string>
#include <vector>
#include <cstdint>

class ImageCompressor {
public:
    ImageCompressor();
    ~ImageCompressor();
    ImageCompressor(const ImageCompressor&) = delete;
    ImageCompressor& operator=(const ImageCompressor&) = delete;

    struct CompressOptions {
        int quality;
        int maxWidth;
        int maxHeight;
        bool preserveAspectRatio;
    };

    struct CompressResult {
        std::vector<uint8_t> data;
        int width;
        int height;
        int channels;
        bool success;
        std::string error;
        size_t originalSize;
        size_t compressedSize;
    };

    CompressResult compress(
        const uint8_t* rgbaData,
        int width,
        int height,
        int channels,
        const CompressOptions& options
    ) const;

    std::vector<uint8_t> decodeJpeg(
        const uint8_t* jpegData,
        size_t jpegSize,
        int& outWidth,
        int& outHeight,
        int& outChannels
    ) const;

    std::vector<uint8_t> decodePng(
        const uint8_t* pngData,
        size_t pngSize,
        int& outWidth,
        int& outHeight,
        int& outChannels
    ) const;

    std::vector<uint8_t> encodeJpeg(
        const uint8_t* rgbaData,
        int width,
        int height,
        int quality
    ) const;

    std::vector<uint8_t> encodePng(
        const uint8_t* rgbaData,
        int width,
        int height,
        int channels
    ) const;

    std::vector<uint8_t> encodeWebp(
        const uint8_t* rgbaData,
        int width,
        int height,
        int quality
    ) const;

    std::vector<uint8_t> resizeImage(
        const uint8_t* srcData,
        int srcWidth,
        int srcHeight,
        int channels,
        int dstWidth,
        int dstHeight
    ) const;

    static std::string getFormatFromMimeType(const std::string& mimeType);

private:
    struct Impl;
    Impl* impl_;
};

#endif