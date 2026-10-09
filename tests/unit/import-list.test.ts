import { describe, expect, it } from "vitest";
import { getRepository } from "@/server/data";
import { importNetflixList } from "@/server/services/import-list";

describe("importing La mia lista from Netflix", () => {
  it("adds new titles to the wishlist, skips what is already there, lists what it cannot find", async () => {
    const res = await importNetflixList("u_marco", [
      { id: "80114855", title: "Squid Game" },
      { id: "80117715", title: "Mindhunter" },
      { id: "81234567", title: "Un titolo che non esiste" },
    ]);
    expect(res).toEqual({ added: ["Squid Game"], already: 1, notFound: ["Un titolo che non esiste"] });
    expect((await getRepository().listWishlist("u_marco")).some((w) => w.titleId === "squid-game")).toBe(true);
    // Again: nothing new.
    expect((await importNetflixList("u_marco", [{ id: "80114855", title: "Squid Game" }])).already).toBe(1);
  });
});
