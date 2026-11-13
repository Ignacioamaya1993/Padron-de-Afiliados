alter table public.afiliados
  add column if not exists foto_perfil_url text;

comment on column public.afiliados.foto_perfil_url is
  'URL de la imagen de perfil del afiliado almacenada en Cloudinary.';
