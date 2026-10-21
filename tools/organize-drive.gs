// Sorts the photography folder in Google Drive into the collection folders the site uses.
//
// 1. Open https://script.google.com and choose New project.
// 2. Replace everything in the editor with this file.
// 3. Put your folder's id below (the part after /folders/ in its share link).
// 4. Press Run with `organize` selected, and allow access to your Drive when asked.
//
// Files are only moved between folders: nothing is copied, edited or deleted, and each file
// keeps its id, so share links keep working. Running it twice does no harm.

const FOLDER_ID = 'PASTE-THE-FOLDER-ID-HERE';

// Folder → photographs. `_hold` folders keep the alternates out of the site.
const PLAN = {
  "01-leaves": [
    "_MG_2729.JPG",
    "_MG_2798.JPG",
    "_MG_2810.JPG",
    "_MG_2813.jpg",
    "_MG_2818.JPG",
    "_MG_2828.JPG",
    "_MG_2829.JPG",
    "_MG_2837.JPG",
    "_MG_2843.JPG"
  ],
  "01-leaves/_hold": [
    "_MG_2786.JPG",
    "_MG_2793.JPG",
    "_MG_2796.JPG",
    "_MG_2797.JPG",
    "_MG_2817.JPG",
    "_MG_2819.JPG",
    "_MG_2821.JPG",
    "_MG_2822.JPG",
    "_MG_2823.JPG",
    "_MG_2824.JPG",
    "_MG_2825.JPG",
    "_MG_2826.JPG",
    "_MG_2827.JPG",
    "_MG_2830.JPG",
    "_MG_2969.JPG"
  ],
  "02-animals": [
    "_MG_2962.JPG",
    "_MG_2963.JPG",
    "_MG_3056.JPG",
    "_MG_3068.jpg"
  ],
  "02-animals/_hold": [
    "_MG_2961.JPG",
    "_MG_3065.JPG",
    "_MG_3066.JPG",
    "_MG_3069.JPG",
    "_MG_3070.JPG",
    "_MG_3071.JPG"
  ],
  "03-light": [
    "_MG_2942.JPG",
    "_MG_2979.JPG",
    "_MG_2998.JPG",
    "_MG_3004.JPG",
    "_MG_3015.JPG",
    "_MG_3023.JPG",
    "_MG_3053.JPG",
    "_MG_3067.JPG",
    "_MG_3079.JPG",
    "_MG_3094.JPG"
  ],
  "03-light/_hold": [
    "_MG_2941.JPG",
    "_MG_2951.JPG",
    "_MG_2977.JPG",
    "_MG_2978.JPG",
    "_MG_2996.JPG",
    "_MG_3001.JPG",
    "_MG_3002.JPG",
    "_MG_3003.JPG",
    "_MG_3010.JPG",
    "_MG_3014.JPG",
    "_MG_3030.JPG",
    "_MG_3035.JPG",
    "_MG_3048.JPG",
    "_MG_3081.JPG",
    "_MG_3082.JPG",
    "_MG_3083.JPG",
    "_MG_3084.JPG",
    "_MG_3085.JPG",
    "_MG_3086.JPG"
  ],
  "04-places": [
    "_MG_2725.JPG",
    "_MG_2726.JPG",
    "_MG_2760.JPG",
    "_MG_2968.JPG",
    "_MG_3124.JPG"
  ],
  "04-places/_hold": [
    "PA180122.JPG",
    "PA180139.JPG",
    "_MG_2758.JPG",
    "_MG_2863.JPG",
    "_MG_2882.jpg",
    "_MG_2883.JPG",
    "_MG_2884.JPG"
  ]
};

function organize() {
  const root = DriveApp.getFolderById(FOLDER_ID);
  let moved = 0;
  for (const [where, names] of Object.entries(PLAN)) {
    const target = where.split('/').reduce((parent, name) => child(parent, name), root);
    for (const name of names) {
      const files = root.getFilesByName(name); // only photographs still at the top level
      while (files.hasNext()) {
        files.next().moveTo(target);
        moved++;
      }
    }
  }
  Logger.log(moved + ' photographs moved.');
}

function child(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}
