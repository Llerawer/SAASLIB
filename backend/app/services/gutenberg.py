import httpx

GUTENDEX_API = "https://gutendex.com/books"


async def search_books(query: str, page: int = 1):
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            GUTENDEX_API,
            params={"search": query, "languages": "en", "page": page},
        )
        r.raise_for_status()
        return r.json()


async def get_book_metadata(gutenberg_id: int):
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(f"{GUTENDEX_API}/{gutenberg_id}")
        r.raise_for_status()
        return r.json()


def get_epub_url(gutenberg_id: int) -> str:
    return f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.images"
