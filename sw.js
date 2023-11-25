---
---
const UNSORTED_AUDIO_FILES = [
{%- for file in site.static_files -%}
    {%- if file.extname == ".mp3" and file.path contains "/static_files/chords" -%}
        "{{ file.name }}",
    {%- endif -%}
{%- endfor -%}
];
const INSTRUMENT_INFO = {
{%- for instrument in site.data.instruments -%}
    {%- assign base_url = 'static_files/samples/' | append: instrument.name -%}
    {%- assign instrument_files = site.static_files |
                where_exp: "file",
                           "file.extname == '.mp3' and file.path contains base_url" -%}
    "{{instrument.name}}": {
        "display_name": "{{instrument.display}}",
        "base_url": "{{base_url}}/",
        {%- if instrument.legacy -%}
        "legacy": true,
        "fallback": "{{ instrument.fallback }}",
        {%- else -%}
        "legacy": false,
        "sample_files": {
            {%- for file in instrument_files -%}
                "{{ file.name | split: 'v' | first }}" : "{{ file.name | replace: '#', '%23' }}",
            {%- endfor -%}
            },
        {%- endif -%}
    },
{%- endfor -%}
};

const APP_CACHE = "cim-cache-v0";
let APP_ASSETS = null;

function get_static_files() {
    if (APP_ASSETS === null) {
        function get_instrument_files(instrument) {
            if (instrument.legacy) {
                return [];
            } else {
                return Object.values(instrument.sample_files).map(
                    (filename) => (instrument.base_url + filename));
            }
        }

        const instrument_files = Object.values(INSTRUMENT_INFO).flatMap(get_instrument_files);
        const audio_files = UNSORTED_AUDIO_FILES.map((file) => "static_files/chords/" + file);
        const extras = [
            "index.html",
            "js/cim.js",
            "assets/css/style.css",
            "assets/fonts/forkawesome-webfont.woff2?v=1.2.0"
        ]

        APP_ASSETS = [];
        APP_ASSETS = APP_ASSETS.concat(instrument_files);
        APP_ASSETS = APP_ASSETS.concat(audio_files);
        APP_ASSETS = APP_ASSETS.concat(extras);
    }

    return APP_ASSETS;
}

self.addEventListener("install", event => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(APP_CACHE);
            console.log("[Service Worker] Caching all: app and shell content");
            await cache.addAll(get_static_files());
        })(),
    );
});

self.addEventListener("activate", (e) => {
    console.log("[Service Worker] Claiming control");
    return self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    (async () => {
      const r = await caches.match(e.request);
      console.log(`[Service Worker] Fetching resource: ${e.request.url}`);
      if (r) {
        return r;
      }
      const response = await fetch(e.request);
      const cache = await caches.open(APP_CACHE);
      console.log(`[Service Worker] Caching new resource: ${e.request.url}`);
      cache.put(e.request, response.clone());
      return response;
    })(),
  );
});
