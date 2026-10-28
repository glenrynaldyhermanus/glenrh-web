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
      { label: "HRIS", href: "/work/hris/", folio: 13 },
      { label: "MAVIS", href: "/work/mavis/", folio: 15 },
      { label: "ShtEV", href: "/work/shtev/", folio: 17 },
      { label: "Climaxx", href: "/work/climaxx/", folio: 19 },
      { label: "Devant", href: "/work/devant/", folio: 21 },
      { label: "Cineflow", href: "/work/cineflow/", folio: 23 },
      { label: "Short stories", href: "/work/short-stories/", folio: 25 }
    ]
  },
  {
    label: "Chapter Three: Playground", href: "/playground/", folio: 27, children: [
      { label: "CV Match", href: "/playground/cv-match/", folio: 29 },
      { label: "Warung Order", href: "/playground/warung-order/", folio: 31 },
      { label: "Charge Sim", href: "/playground/charge-sim/", folio: 33 },
      { label: "Glen Pet", href: "/playground/glen-pet/", folio: 35 }
    ]
  },
  { label: "Epilogue: Hire Me", href: "/hire-me/", folio: 37 }
];
