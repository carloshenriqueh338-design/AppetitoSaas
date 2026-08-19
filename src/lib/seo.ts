import { useEffect } from 'react';

type SEOProps = {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  siteName?: string;
  jsonLd?: Record<string, unknown>;
};

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useSEO({ title, description, image, url, type = 'website', siteName, jsonLd }: SEOProps) {
  useEffect(() => {
    document.title = title;

    if (description) setMeta('name', 'description', description);

    setMeta('property', 'og:title', title);
    if (description) setMeta('property', 'og:description', description);
    if (image) setMeta('property', 'og:image', image);
    if (url) setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', type);
    if (siteName) setMeta('property', 'og:site_name', siteName);

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    if (description) setMeta('name', 'twitter:description', description);
    if (image) setMeta('name', 'twitter:image', image);

    if (url) setLink('canonical', url);

    // JSON-LD structured data
    const existingLd = document.getElementById('json-ld-dynamic');
    if (existingLd) existingLd.remove();

    if (jsonLd) {
      const script = document.createElement('script');
      script.id = 'json-ld-dynamic';
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      const ld = document.getElementById('json-ld-dynamic');
      if (ld) ld.remove();
    };
  }, [title, description, image, url, type, siteName, jsonLd]);
}
