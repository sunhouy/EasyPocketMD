#include "image_compressor.h"
#include <cstring>
#include <cmath>
#include <algorithm>
#include <stdexcept>
#include <sstream>
#include <csetjmp>

extern "C" {
#include <jpeglib.h>
#include <png.h>
}

struct ImageCompressor::Impl {
    Impl() {}
    ~Impl() {}
};

ImageCompressor::ImageCompressor() : impl_(new Impl()) {}

ImageCompressor::~ImageCompressor() {
    delete impl_;
}

std::vector<uint8_t> ImageCompressor::decodeJpeg(
    const uint8_t* jpegData,
    size_t jpegSize,
    int& outWidth,
    int& outHeight,
    int& outChannels
) const {
    struct JpegDecompressCtx {
        jpeg_decompress_struct cinfo;
        jpeg_error_mgr jerr;
        jmp_buf setjmp_buffer;
    };

    auto* ctx = new JpegDecompressCtx();
    ctx->cinfo.err = jpeg_std_error(&ctx->jerr);
    jpeg_create_decompress(&ctx->cinfo);

    jpeg_mem_src(&ctx->cinfo, const_cast<uint8_t*>(jpegData), jpegSize);

    if (setjmp(ctx->setjmp_buffer)) {
        jpeg_destroy_decompress(&ctx->cinfo);
        delete ctx;
        return {};
    }

    jpeg_read_header(&ctx->cinfo, TRUE);
    ctx->cinfo.out_color_space = JCS_RGB;
    jpeg_start_decompress(&ctx->cinfo);

    outWidth = ctx->cinfo.output_width;
    outHeight = ctx->cinfo.output_height;
    outChannels = 3;

    std::vector<uint8_t> rgbData(outWidth * outHeight * 3);
    JSAMPROW rowPointer[1];

    while (ctx->cinfo.output_scanline < outHeight) {
        rowPointer[0] = &rgbData[ctx->cinfo.output_scanline * outWidth * 3];
        jpeg_read_scanlines(&ctx->cinfo, rowPointer, 1);
    }

    jpeg_finish_decompress(&ctx->cinfo);
    jpeg_destroy_decompress(&ctx->cinfo);
    delete ctx;

    return rgbData;
}

std::vector<uint8_t> ImageCompressor::decodePng(
    const uint8_t* pngData,
    size_t pngSize,
    int& outWidth,
    int& outHeight,
    int& outChannels
) const {
    png_structp pngPtr = png_create_read_struct(PNG_LIBPNG_VER_STRING, nullptr, nullptr, nullptr);
    if (!pngPtr) return {};

    png_infop infoPtr = png_create_info_struct(pngPtr);
    if (!infoPtr) {
        png_destroy_read_struct(&pngPtr, nullptr, nullptr);
        return {};
    }

    if (setjmp(png_jmpbuf(pngPtr))) {
        png_destroy_read_struct(&pngPtr, &infoPtr, nullptr);
        return {};
    }

    png_bytep* rowPtrs = nullptr;
    std::vector<uint8_t> imageData;

    png_set_sig_bytes(pngPtr, 0);
    png_set_user_limits(pngPtr, 4096, 4096);
    png_read_info(pngPtr, infoPtr);

    outWidth = png_get_image_width(pngPtr, infoPtr);
    outHeight = png_get_image_height(pngPtr, infoPtr);
    png_byte colorType = png_get_color_type(pngPtr, infoPtr);
    png_byte bitDepth = png_get_bit_depth(pngPtr, infoPtr);

    if (bitDepth == 16) png_set_strip_16(pngPtr);
    if (colorType == PNG_COLOR_TYPE_PALETTE) png_set_palette_to_rgb(pngPtr);
    if (colorType == PNG_COLOR_TYPE_GRAY && bitDepth < 8) png_set_expand_gray_1_2_4_to_8(pngPtr);
    if (png_get_valid(pngPtr, infoPtr, PNG_INFO_tRNS)) png_set_tRNS_to_alpha(pngPtr);

    if (colorType == PNG_COLOR_TYPE_RGB ||
        colorType == PNG_COLOR_TYPE_GRAY ||
        colorType == PNG_COLOR_TYPE_PALETTE) {
        png_set_filler(pngPtr, 0xFF, PNG_FILLER_AFTER);
    }

    if (colorType == PNG_COLOR_TYPE_GRAY ||
        colorType == PNG_COLOR_TYPE_GRAY_ALPHA) {
        png_set_gray_to_rgb(pngPtr);
    }

    png_read_update_info(pngPtr, infoPtr);

    outChannels = 4;
    imageData.resize(outWidth * outHeight * 4);
    rowPtrs = new png_bytep[outHeight];

    for (int y = 0; y < outHeight; ++y) {
        rowPtrs[y] = &imageData[y * outWidth * 4];
    }

    png_read_image(pngPtr, rowPtrs);
    png_destroy_read_struct(&pngPtr, &infoPtr, nullptr);
    delete[] rowPtrs;

    return imageData;
}

std::vector<uint8_t> ImageCompressor::encodeJpeg(
    const uint8_t* rgbaData,
    int width,
    int height,
    int quality
) const {
    struct JpegCompressCtx {
        jpeg_compress_struct cinfo;
        jpeg_error_mgr jerr;
    };

    auto* ctx = new JpegCompressCtx();
    ctx->cinfo.err = jpeg_std_error(&ctx->jerr);
    jpeg_create_compress(&ctx->cinfo);

    unsigned char* outputBuffer = nullptr;
    unsigned long outSize = 0;

    jpeg_mem_dest(&ctx->cinfo, &outputBuffer, &outSize);

    ctx->cinfo.image_width = width;
    ctx->cinfo.image_height = height;
    ctx->cinfo.input_components = 3;
    ctx->cinfo.in_color_space = JCS_RGB;

    jpeg_set_defaults(&ctx->cinfo);
    jpeg_set_quality(&ctx->cinfo, quality, TRUE);
    jpeg_start_compress(&ctx->cinfo, TRUE);

    std::vector<uint8_t> rgbData(width * height * 3);
    for (int i = 0; i < width * height; ++i) {
        rgbData[i * 3] = rgbaData[i * 4];
        rgbData[i * 3 + 1] = rgbaData[i * 4 + 1];
        rgbData[i * 3 + 2] = rgbaData[i * 4 + 2];
    }

    JSAMPROW rowPointer[1];
    while (ctx->cinfo.next_scanline < height) {
        rowPointer[0] = &rgbData[ctx->cinfo.next_scanline * width * 3];
        jpeg_write_scanlines(&ctx->cinfo, rowPointer, 1);
    }

    jpeg_finish_compress(&ctx->cinfo);

    std::vector<uint8_t> result(outputBuffer, outputBuffer + outSize);
    free(outputBuffer);

    jpeg_destroy_compress(&ctx->cinfo);
    delete ctx;

    return result;
}

std::vector<uint8_t> ImageCompressor::encodePng(
    const uint8_t* rgbaData,
    int width,
    int height,
    int channels
) const {
    png_structp pngPtr = png_create_write_struct(PNG_LIBPNG_VER_STRING, nullptr, nullptr, nullptr);
    if (!pngPtr) return {};

    png_infop infoPtr = png_create_info_struct(pngPtr);
    if (!infoPtr) {
        png_destroy_write_struct(&pngPtr, nullptr);
        return {};
    }

    if (setjmp(png_jmpbuf(pngPtr))) {
        png_destroy_write_struct(&pngPtr, &infoPtr);
        return {};
    }

    std::vector<uint8_t> output;
    png_set_write_fn(pngPtr, &output, [](png_structp pngPtr, png_bytep data, png_size_t length) {
        auto* output = static_cast<std::vector<uint8_t>*>(png_get_io_ptr(pngPtr));
        output->insert(output->end(), data, data + length);
    }, nullptr);

    int colorType = (channels == 1) ? PNG_COLOR_TYPE_GRAY :
                    (channels == 2) ? PNG_COLOR_TYPE_GRAY_ALPHA :
                    (channels == 3) ? PNG_COLOR_TYPE_RGB : PNG_COLOR_TYPE_RGBA;

    png_set_IHDR(pngPtr, infoPtr, width, height, 8, colorType,
                  PNG_INTERLACE_NONE, PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);

    png_write_info(pngPtr, infoPtr);

    std::vector<png_bytep> rowPtrs(height);
    const uint8_t* row = rgbaData;
    for (int y = 0; y < height; ++y) {
        rowPtrs[y] = const_cast<png_bytep>(row);
        row += width * channels;
    }

    png_write_image(pngPtr, rowPtrs.data());
    png_write_end(pngPtr, infoPtr);
    png_destroy_write_struct(&pngPtr, &infoPtr);

    return output;
}

std::vector<uint8_t> ImageCompressor::encodeWebp(
    const uint8_t* rgbaData,
    int width,
    int height,
    int quality
) const {
    return {};
}

std::vector<uint8_t> ImageCompressor::resizeImage(
    const uint8_t* srcData,
    int srcWidth,
    int srcHeight,
    int channels,
    int dstWidth,
    int dstHeight
) const {
    if (dstWidth <= 0 || dstHeight <= 0 || channels <= 0) return {};
    if (dstWidth == srcWidth && dstHeight == srcHeight) {
        return std::vector<uint8_t>(srcData, srcData + srcWidth * srcHeight * channels);
    }

    std::vector<uint8_t> dstData(dstWidth * dstHeight * channels);

    float scaleX = static_cast<float>(srcWidth) / dstWidth;
    float scaleY = static_cast<float>(srcHeight) / dstHeight;

    for (int dy = 0; dy < dstHeight; ++dy) {
        for (int dx = 0; dx < dstWidth; ++dx) {
            float sx = (dx + 0.5f) * scaleX - 0.5f;
            float sy = (dy + 0.5f) * scaleY - 0.5f;

            int x0 = static_cast<int>(std::floor(sx));
            int y0 = static_cast<int>(std::floor(sy));
            int x1 = std::min(x0 + 1, srcWidth - 1);
            int y1 = std::min(y0 + 1, srcHeight - 1);

            float fx = sx - x0;
            float fy = sy - y0;

            for (int c = 0; c < channels; ++c) {
                float v00 = srcData[(y0 * srcWidth + x0) * channels + c];
                float v01 = srcData[(y0 * srcWidth + x1) * channels + c];
                float v10 = srcData[(y1 * srcWidth + x0) * channels + c];
                float v11 = srcData[(y1 * srcWidth + x1) * channels + c];

                float top = v00 * (1 - fx) + v01 * fx;
                float bottom = v10 * (1 - fx) + v11 * fx;
                float value = top * (1 - fy) + bottom * fy;

                dstData[(dy * dstWidth + dx) * channels + c] = static_cast<uint8_t>(
                    std::max(0.0f, std::min(255.0f, value))
                );
            }
        }
    }

    return dstData;
}

ImageCompressor::CompressResult ImageCompressor::compress(
    const uint8_t* rgbaData,
    int width,
    int height,
    int channels,
    const CompressOptions& options
) const {
    CompressResult result;
    result.success = false;
    result.width = width;
    result.height = height;
    result.channels = channels;
    result.originalSize = width * height * channels;

    try {
        int targetWidth = width;
        int targetHeight = height;

        if (options.maxWidth > 0 && width > options.maxWidth) {
            targetWidth = options.maxWidth;
            if (options.preserveAspectRatio) {
                targetHeight = static_cast<int>(height * options.maxWidth / width);
            }
        }

        if (options.maxHeight > 0 && targetHeight > options.maxHeight) {
            targetHeight = options.maxHeight;
            if (options.preserveAspectRatio) {
                targetWidth = static_cast<int>(width * options.maxHeight / height);
            }
        }

        std::vector<uint8_t> resizedData;
        if (targetWidth != width || targetHeight != height) {
            resizedData = resizeImage(rgbaData, width, height, channels, targetWidth, targetHeight);
            if (resizedData.empty()) {
                result.error = "Resize failed";
                return result;
            }
        } else {
            resizedData.assign(rgbaData, rgbaData + width * height * channels);
        }

        int quality = std::max(1, std::min(100, options.quality));
        result.data = encodeJpeg(resizedData.data(), targetWidth, targetHeight, quality);

        if (result.data.empty()) {
            result.error = "JPEG encoding failed";
            return result;
        }

        result.width = targetWidth;
        result.height = targetHeight;
        result.compressedSize = result.data.size();
        result.success = true;

    } catch (const std::exception& e) {
        result.error = e.what();
    } catch (...) {
        result.error = "Unknown error during compression";
    }

    return result;
}

std::string ImageCompressor::getFormatFromMimeType(const std::string& mimeType) {
    if (mimeType == "image/jpeg" || mimeType == "image/jpg") return "jpeg";
    if (mimeType == "image/png") return "png";
    if (mimeType == "image/webp") return "webp";
    if (mimeType == "image/gif") return "gif";
    return "";
}