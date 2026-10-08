/** Lower-case and strip accents so "shogun" finds "Shōgun". */
export function searchKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}
