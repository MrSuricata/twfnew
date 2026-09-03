/**
 * Builders tipados para Schema.org JSON-LD.
 * Cada sitio importa el suyo y lo monta vía <JsonLd> en el <head>.
 */

export interface PostalAddress {
  streetAddress: string;
  addressLocality: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry: string;
}

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface OpeningHoursSpec {
  dayOfWeek: string | string[];
  opens: string;
  closes: string;
}

export interface BaseBusinessInput {
  name: string;
  url: string;
  description?: string;
  telephone?: string;
  email?: string;
  image?: string | string[];
  address: PostalAddress;
  geo?: GeoCoordinates;
  openingHours?: OpeningHoursSpec[];
  priceRange?: string;
  sameAs?: string[];
}

function baseShape(type: string, input: BaseBusinessInput) {
  return {
    '@context': 'https://schema.org',
    '@type': type,
    name: input.name,
    url: input.url,
    description: input.description,
    telephone: input.telephone,
    email: input.email,
    image: input.image,
    address: { '@type': 'PostalAddress', ...input.address },
    geo: input.geo ? { '@type': 'GeoCoordinates', ...input.geo } : undefined,
    openingHoursSpecification: input.openingHours?.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      ...h,
    })),
    priceRange: input.priceRange,
    sameAs: input.sameAs,
  };
}

export const localBusiness = (input: BaseBusinessInput) => baseShape('LocalBusiness', input);
export const restaurant = (input: BaseBusinessInput & { servesCuisine?: string[] }) => ({
  ...baseShape('Restaurant', input),
  servesCuisine: input.servesCuisine,
});
export const barOrPub = (input: BaseBusinessInput) => baseShape('BarOrPub', input);
export const hotel = (input: BaseBusinessInput & { starRating?: number }) => ({
  ...baseShape('Hotel', input),
  starRating: input.starRating
    ? { '@type': 'Rating', ratingValue: input.starRating }
    : undefined,
});
export const hostel = (input: BaseBusinessInput) => baseShape('Hostel', input);
export const artGallery = (input: BaseBusinessInput) => baseShape('ArtGallery', input);
export const store = (input: BaseBusinessInput) => baseShape('Store', input);
export const bookStore = (input: BaseBusinessInput) => baseShape('BookStore', input);
export const healthAndBeauty = (input: BaseBusinessInput) =>
  baseShape('HealthAndBeautyBusiness', input);
export const tattooParlor = (input: BaseBusinessInput) => baseShape('TattooParlor', input);

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export const breadcrumbList = (items: BreadcrumbItem[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    item: it.url,
  })),
});

export interface EventInput {
  name: string;
  startDate: string;
  endDate?: string;
  url: string;
  location: { name: string; address: PostalAddress };
  image?: string;
  description?: string;
  offers?: { price: number; priceCurrency: string; availability?: string; url?: string };
}

export const event = (input: EventInput) => ({
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: input.name,
  startDate: input.startDate,
  endDate: input.endDate,
  url: input.url,
  image: input.image,
  description: input.description,
  location: {
    '@type': 'Place',
    name: input.location.name,
    address: { '@type': 'PostalAddress', ...input.location.address },
  },
  offers: input.offers
    ? {
        '@type': 'Offer',
        ...input.offers,
        availability: input.offers.availability ?? 'https://schema.org/InStock',
      }
    : undefined,
});
