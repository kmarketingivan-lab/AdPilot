import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Resize presets per piattaforma social
const PRESETS = {
  instagram_square: { width: 1080, height: 1080, crop: "fill" as const },
  instagram_portrait: { width: 1080, height: 1350, crop: "fill" as const },
  instagram_story: { width: 1080, height: 1920, crop: "fill" as const },
  facebook_post: { width: 1200, height: 630, crop: "fill" as const },
  linkedin_post: { width: 1200, height: 627, crop: "fill" as const },
  twitter_post: { width: 1200, height: 675, crop: "fill" as const },
  tiktok_cover: { width: 1080, height: 1920, crop: "fill" as const },
  thumbnail: { width: 400, height: 400, crop: "fill" as const },
} as const;

export type PresetName = keyof typeof PRESETS;

export async function uploadImage(
  fileBuffer: Buffer,
  options?: {
    folder?: string;
    preset?: PresetName;
    publicId?: string;
  }
) {
  const preset = options?.preset ? PRESETS[options.preset] : undefined;

  return new Promise<{ url: string; publicId: string; width: number; height: number }>(
    (resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options?.folder ?? "adpilot",
          public_id: options?.publicId,
          resource_type: "auto",
          ...(preset && {
            transformation: [preset],
          }),
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error("Upload failed"));
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
          });
        }
      );
      uploadStream.end(fileBuffer);
    }
  );
}

export function getResizedUrl(publicId: string, preset: PresetName): string {
  const p = PRESETS[preset];
  return cloudinary.url(publicId, {
    transformation: [{ width: p.width, height: p.height, crop: p.crop }],
    secure: true,
  });
}

export async function deleteImage(publicId: string) {
  return cloudinary.uploader.destroy(publicId);
}

export { cloudinary };
