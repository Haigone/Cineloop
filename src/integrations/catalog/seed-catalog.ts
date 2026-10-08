import type { Title } from "@/domain/types";
import { searchKey } from "@/lib/text";
import { SEED_TITLES } from "@/server/data/seed/catalog";
import type { CatalogService } from "./types";

/** The bundled demo catalog. Works offline and needs no keys. */
export class SeedCatalog implements CatalogService {
  readonly name = "demo";
  private titles = new Map(SEED_TITLES.map((t) => [t.id, t]));

  async search(query: string, limit: number): Promise<Title[]> {
    const q = searchKey(query);
    if (!q) return [];
    return [...this.titles.values()].filter((t) => searchKey(t.title).includes(q)).slice(0, limit);
  }

  async getTitle(id: string): Promise<Title | null> {
    return this.titles.get(id) ?? null;
  }
}
