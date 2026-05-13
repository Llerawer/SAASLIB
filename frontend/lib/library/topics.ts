/**
 * Gutenberg-style topic taxonomy translated to Spanish.
 * Each entry: label (shown), topic (what we send to Gutendex full-text search).
 *
 * Gutendex `topic` queries hit both subjects + bookshelves, so English
 * search terms work even when the user sees Spanish labels.
 */

export type Topic = { label: string; topic: string };
export type TopicGroup = { name: string; topics: Topic[] };

export const TOPIC_GROUPS: TopicGroup[] = [
  {
    name: "Literatura",
    topics: [
      { label: "Aventura", topic: "adventure" },
      { label: "Lit. estadounidense", topic: "american literature" },
      { label: "Lit. británica", topic: "british literature" },
      { label: "Lit. francesa", topic: "french literature" },
      { label: "Lit. alemana", topic: "german literature" },
      { label: "Lit. rusa", topic: "russian literature" },
      { label: "Clásicos", topic: "classics" },
      { label: "Biografías", topic: "biography" },
      { label: "Novelas", topic: "novels" },
      { label: "Cuentos cortos", topic: "short stories" },
      { label: "Poesía", topic: "poetry" },
      { label: "Teatro / Drama", topic: "drama" },
      { label: "Romance", topic: "love" },
      { label: "Ciencia ficción", topic: "science fiction" },
      { label: "Fantasía", topic: "fantasy" },
      { label: "Misterio / Crimen", topic: "mystery" },
      { label: "Mitología y folclore", topic: "mythology" },
      { label: "Humor", topic: "humor" },
      { label: "Infantil y juvenil", topic: "children" },
    ],
  },
  {
    name: "Historia",
    topics: [
      { label: "Hist. americana", topic: "american history" },
      { label: "Hist. británica", topic: "british history" },
      { label: "Hist. europea", topic: "european history" },
      { label: "Antigüedad clásica", topic: "classical antiquity" },
      { label: "Edad Media", topic: "medieval" },
      { label: "Hist. religiosa", topic: "religious history" },
      { label: "Realeza", topic: "royalty" },
      { label: "Guerra", topic: "war" },
      { label: "Arqueología", topic: "archaeology" },
    ],
  },
  {
    name: "Ciencia y Tecnología",
    topics: [
      { label: "Física", topic: "physics" },
      { label: "Química", topic: "chemistry" },
      { label: "Biología", topic: "biology" },
      { label: "Matemáticas", topic: "mathematics" },
      { label: "Ingeniería", topic: "engineering" },
      { label: "Medio ambiente", topic: "environment" },
      { label: "Ciencias de la Tierra", topic: "earth science" },
    ],
  },
  {
    name: "Sociedad",
    topics: [
      { label: "Política", topic: "politics" },
      { label: "Economía", topic: "economics" },
      { label: "Sociología", topic: "sociology" },
      { label: "Psicología", topic: "psychology" },
      { label: "Derecho", topic: "law" },
      { label: "Negocios", topic: "business" },
      { label: "Familia", topic: "family" },
    ],
  },
  {
    name: "Filosofía y religión",
    topics: [
      { label: "Filosofía", topic: "philosophy" },
      { label: "Ética", topic: "ethics" },
      { label: "Religión", topic: "religion" },
      { label: "Espiritualidad", topic: "spirituality" },
    ],
  },
  {
    name: "Arte y cultura",
    topics: [
      { label: "Arte", topic: "art" },
      { label: "Música", topic: "music" },
      { label: "Arquitectura", topic: "architecture" },
      { label: "Lenguaje", topic: "language" },
      { label: "Ensayos y cartas", topic: "essays" },
    ],
  },
  {
    name: "Estilo de vida",
    topics: [
      { label: "Cocina", topic: "cooking" },
      { label: "Viajes", topic: "travel" },
      { label: "Naturaleza", topic: "nature" },
      { label: "Animales", topic: "animals" },
      { label: "Deportes", topic: "sports" },
      { label: "Cómo hacer / Manuales", topic: "how to" },
    ],
  },
  {
    name: "Salud y educación",
    topics: [
      { label: "Salud", topic: "health" },
      { label: "Medicina", topic: "medicine" },
      { label: "Nutrición", topic: "nutrition" },
      { label: "Educación", topic: "education" },
      { label: "Diccionarios y referencia", topic: "dictionaries" },
    ],
  },
];
