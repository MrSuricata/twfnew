import { z } from 'zod';

export const menuItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  priceUYU: z.number().nonnegative().optional(),
  category: z.enum([
    'entrada',
    'pizza',
    'pasta',
    'minuta',
    'postre',
    'bebida',
    'vino',
    'cocktail',
    'picada',
    'chivito',
    'otro',
  ]),
  tags: z.array(z.string()).optional(),
  isVegetarian: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isGlutenFree: z.boolean().optional(),
  isSpecialty: z.boolean().optional(),
  image: z.string().optional(),
  order: z.number().int().optional(),
});

export type MenuItem = z.infer<typeof menuItemSchema>;

export const historyMilestoneSchema = z.object({
  year: z.union([z.number().int(), z.string()]),
  title: z.string(),
  description: z.string(),
  image: z.string().optional(),
});

export type HistoryMilestone = z.infer<typeof historyMilestoneSchema>;

export const galleryImageSchema = z.object({
  src: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
  credit: z.string().optional(),
});

export type GalleryImage = z.infer<typeof galleryImageSchema>;

export const testimonialSchema = z.object({
  author: z.string(),
  role: z.string().optional(),
  quote: z.string(),
  source: z.string().optional(),
  date: z.string().optional(),
});

export type Testimonial = z.infer<typeof testimonialSchema>;

export const faqSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export type Faq = z.infer<typeof faqSchema>;

export const artistSchema = z.object({
  name: z.string(),
  bio: z.string().optional(),
  style: z.string().optional(),
  instagram: z.string().optional(),
  portrait: z.string().optional(),
});

export type Artist = z.infer<typeof artistSchema>;

export const serviceSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  priceUYU: z.number().optional(),
  priceLabel: z.string().optional(),
  duration: z.string().optional(),
  order: z.number().int().optional(),
});

export type Service = z.infer<typeof serviceSchema>;

export const localeSchema = z.enum(['es', 'en', 'pt']);

export const roomSchema = z.object({
  slug: z.string(),
  name: z.record(localeSchema, z.string()),
  description: z.record(localeSchema, z.string()).optional(),
  type: z.enum(['single', 'double', 'suite', 'family', 'dorm', 'private']),
  capacity: z.number().int().min(1),
  basePriceUYU: z.number().nonnegative(),
  hasPortView: z.boolean().optional(),
  amenities: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
});

export type Room = z.infer<typeof roomSchema>;

export const workshopSchema = z.object({
  slug: z.string(),
  title: z.record(localeSchema, z.string()),
  description: z.record(localeSchema, z.string()).optional(),
  dateTime: z.string(),
  durationMinutes: z.number().int().positive(),
  capacity: z.number().int().positive(),
  priceUYU: z.number().nonnegative(),
  instructor: z.string().optional(),
  images: z.array(z.string()).optional(),
});

export type Workshop = z.infer<typeof workshopSchema>;

export const cityTourSchema = z.object({
  slug: z.string(),
  title: z.record(localeSchema, z.string()),
  description: z.record(localeSchema, z.string()).optional(),
  schedulePattern: z.string().optional(),
  durationMinutes: z.number().int().positive(),
  capacity: z.number().int().positive().optional(),
  priceUYU: z.number().nonnegative(),
  languages: z.array(localeSchema).optional(),
  images: z.array(z.string()).optional(),
});

export type CityTour = z.infer<typeof cityTourSchema>;

export const artPieceSchema = z.object({
  slug: z.string(),
  title: z.record(localeSchema, z.string()),
  description: z.record(localeSchema, z.string()).optional(),
  category: z.string(),
  style: z.string().optional(),
  era: z.string().optional(),
  dimensions: z.string().optional(),
  provenance: z.string().optional(),
  condition: z.string().optional(),
  priceUYU: z.number().optional(),
  priceVisible: z.boolean().optional(),
  status: z.enum(['available', 'reserved', 'sold', 'hidden']).default('available'),
  images: z.array(z.string()).optional(),
});

export type ArtPiece = z.infer<typeof artPieceSchema>;
