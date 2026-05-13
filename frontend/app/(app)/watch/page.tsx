import { redirect } from "next/navigation";

// /watch (sin videoId) era una página de "pegar URL" duplicada de /videos.
// Quedó deprecada cuando /videos absorbió ese flow + la lista. Se mantiene
// el path como redirect para preservar bookmarks/links viejos.
export default function WatchIndexPage() {
  redirect("/videos");
}
