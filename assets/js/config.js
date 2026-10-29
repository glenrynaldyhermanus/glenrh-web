export const CONTACT = {
  name: "Glen Rynaldy Hermanus",
  email: "glen.rynaldy@gmail.com",
  phone: "+62 813 1416 9140",
  phoneHref: "tel:+6281314169140",
  linkedin: "https://www.linkedin.com/in/glen-rynaldy-hermanus-16841268/",
  instagram: "https://www.instagram.com/glen.rynaldy"
};

/** Table of contents. `folio` is the left-hand page number of each spread. */
export const CONTENTS = [
  { label: "Prologue: Who is Glen?", href: "/#prologue", folio: 1 },
  { label: "Chapter One: Me", href: "/me/", folio: 3 },
  {
    label: "Chapter Two: Work", href: "/work/", folio: 11, children: [
      { label: "m.tix", href: "/work/mtix/", folio: 13 },
      { label: "Metropole Padel", href: "/work/padel/", folio: 15 },
      { label: "HRIS", href: "/work/hris/", folio: 17 },
      { label: "Allnimall", href: "/work/allnimall/", folio: 19 },
      { label: "ShtEV", href: "/work/shtev/", folio: 21 },
      { label: "Climaxx", href: "/work/climaxx/", folio: 23 },
      { label: "MAVIS", href: "/work/mavis/", folio: 25 },
      { label: "Transmore", href: "/work/transmore/", folio: 27 },
      { label: "Ourbit", href: "/work/ourbit/", folio: 29 },
      { label: "Short stories", href: "/work/short-stories/", folio: 31 }
    ]
  },
  {
    label: "Chapter Three: Playground", href: "/playground/", folio: 33, children: [
      { label: "CV Match", href: "/playground/cv-match/", folio: 35 },
      { label: "Warung Order", href: "/playground/warung-order/", folio: 37 },
      { label: "Charge Sim", href: "/playground/charge-sim/", folio: 39 },
      { label: "Glen Pet", href: "/playground/glen-pet/", folio: 41 },
      { label: "Tamengetit", href: "/playground/tamengetit/", folio: 43 },
      { label: "Lobby Land", href: "/playground/lobbyland/", folio: 45 }
    ]
  },
  { label: "Epilogue: Hire Me", href: "/hire-me/", folio: 47 },
  { label: "Afterword: Visitors’ Book", href: "/guestbook/", folio: 49 }
];
