import { supabase } from '@/lib/supabase';

export type UploadResult = {
  success: boolean;
  url: string | null;
  error?: string;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Formato não suportado. Use JPG, PNG, WebP ou GIF.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Arquivo muito grande. Máximo 5MB.';
  }
  return null;
}

export async function uploadRestaurantImage(
  restaurantId: string,
  file: File,
  type: 'logo' | 'cover',
): Promise<UploadResult> {
  const validationError = validateImageFile(file);
  if (validationError) return { success: false, url: null, error: validationError };

  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${restaurantId}/${type}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('restaurant-images')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) return { success: false, url: null, error: error.message };

  const { data: urlData } = supabase.storage
    .from('restaurant-images')
    .getPublicUrl(path);

  return { success: true, url: urlData.publicUrl };
}

export async function uploadProductImage(
  restaurantId: string,
  file: File,
): Promise<UploadResult> {
  const validationError = validateImageFile(file);
  if (validationError) return { success: false, url: null, error: validationError };

  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${restaurantId}/product-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) return { success: false, url: null, error: error.message };

  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(path);

  return { success: true, url: urlData.publicUrl };
}
