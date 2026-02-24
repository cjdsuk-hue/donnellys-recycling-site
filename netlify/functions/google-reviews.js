// netlify/functions/google-reviews.js
// Fetch Google Business rating + latest reviews using Places API (server-side).
// Set environment variable in Netlify:
//   GOOGLE_PLACES_API_KEY = <your Google Places API key>
//
// This avoids exposing your API key in the browser.

export default async (req, context) => {
  try {
    const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing GOOGLE_PLACES_API_KEY" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Resolve Place ID either from environment or via a one‑off text search.
    // If GOOGLE_PLACE_ID is set in the Netlify environment the function will
    // use it directly, which avoids an extra API call. Otherwise we look up
    // the ID based on a fixed business name.

    let placeId = process.env.GOOGLE_PLACE_ID;
    if (!placeId) {
      // Business name query (used to find Place ID when not provided)
      const query = "Donnelly's Recycling Nottingham";
      const findUrl =
        "https://maps.googleapis.com/maps/api/place/findplacefromtext/json" +
        "?input=" + encodeURIComponent(query) +
        "&inputtype=textquery" +
        "&fields=place_id,name,formatted_address" +
        "&key=" + encodeURIComponent(API_KEY);
      const findRes = await fetch(findUrl);
      const findJson = await findRes.json();
      const cand = (findJson && findJson.candidates && findJson.candidates[0]) || null;
      if (!cand || !cand.place_id) {
        return new Response(JSON.stringify({ ok: false, error: "Place not found", debug: findJson }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      placeId = cand.place_id;
    }

    // 2) Place details (rating, total ratings, reviews)
    const detailsUrl = 
      "https://maps.googleapis.com/maps/api/place/details/json" +
      "?place_id=" + encodeURIComponent(placeId) + 
      "&fields=name,rating,user_ratings_total,reviews,url" +
      "&key=" + encodeURIComponent(API_KEY);
    const detailsRes = await fetch(detailsUrl);
    const detailsJson = await detailsRes.json();

    if (!detailsJson || detailsJson.status !== "OK" || !detailsJson.result) {
      return new Response(JSON.stringify({ ok: false, error: "Place details error", debug: detailsJson }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    const r = detailsJson.result;
    const reviews = Array.isArray(r.reviews) ? r.reviews.slice(0, 6).map(rv => ({
      author_name: rv.author_name || "Customer",
      rating: rv.rating || null,
      text: rv.text || "",
      relative_time_description: rv.relative_time_description || "",
    })) : [];

    return new Response(JSON.stringify({
      ok: true,
      name: r.name || "Donnelly's Recycling",
      rating: r.rating ?? null,
      user_ratings_total: r.user_ratings_total ?? null,
      url: "https://www.google.com/maps?cid=14989160805684334058",
      reviews,
      // Helpful links (CID based)
      links: {
        read: "https://www.google.com/maps?cid=14989160805684334058",
        write: "https://google.com/maps/place?cid=14989160805684334058&dtab=2&action=openratings&ct=write-review"
      }
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=300" // 5 minutes
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
