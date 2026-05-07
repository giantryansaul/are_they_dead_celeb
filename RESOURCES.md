# External Resources

## APIs Used

### TMDB (The Movie Database)
- **Purpose:** Celebrity popularity ranking, birth/death dates, profile images
- **Docs:** https://developer.themoviedb.org/docs/getting-started
- **Endpoints:**
  - `GET /person/popular` — paginated list ordered by popularity score
  - `GET /person/{id}` — fields: `name`, `popularity`, `birthday`, `deathday`, `profile_path`
- **Image URL:** `https://image.tmdb.org/t/p/w185/{profile_path}`
- **Auth:** API key via `Authorization: Bearer <token>` header or `?api_key=` query param
- **Rate limit:** 50 requests/second
- **Free tier:** Yes (non-commercial use)

### Wikidata
- **Purpose:** Cross-checking celebrity death dates for accuracy (P570 = date of death)
- **Docs:** https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service
- **Endpoint:** `https://query.wikidata.org/sparql`
- **Properties:** P569 (date of birth), P570 (date of death), P4985 (TMDB person ID)
- **Auth:** None required (public SPARQL endpoint)
- **Rate limit:** Fair-use; avoid bulk queries
