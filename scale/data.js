// The 55 objects on the poster, smallest to largest, in poster order (rows of 1, 2, 3 … 10).
// [image file name (without extension), label, size in nm as printed on the poster]
// "10^x" is drawn as a superscript.
const ITEM_DATA = [
  ['higgs-boson', 'Higgs boson', '1.6 × 10^-9'],
  ['proton', 'Proton', '1.7 × 10^-6'],
  ['hydrogen-atom', 'Hydrogen atom', '0.106'],
  ['gold-atom', 'Gold atom', '0.29'],
  ['buckyball', 'Buckyball', '0.7'],
  ['dna-helix', 'DNA helix', '2'],
  ['actin-filament', 'Actin filament', '7'],
  ['ibm-quantum-corral', 'IBM quantum corral', '14'],
  ['ribosome', 'Ribosome', '20'],
  ['poliovirus', 'Poliovirus', '30'],
  ['adenovirus', 'Adenovirus', '90'],
  ['hiv', 'HIV', '120'],
  ['bacteriophage-t4', 'Bacteriophage T4', '200'],
  ['mimivirus', 'Mimivirus', '750'],
  ['platelet', 'Platelet', '2,500'],
  ['yeast-cell', 'Yeast cell', '5,000'],
  ['red-blood-cell', 'Red blood cell', '7,500'],
  ['ragweed-pollen-grain', 'Ragweed pollen grain', '20,000'],
  ['human-hair', 'Human hair', '75,000'],
  ['human-egg-cell', 'Human egg cell', '120,000'],
  ['dust-mite', 'Dust mite', '250,000'],
  ['tardigrade', 'Tardigrade', '500,000'],
  ['fruit-fly', 'Fruit fly', '3,000,000'],
  ['ant', 'Ant', '5,000,000'],
  ['ladybug', 'Ladybug', '7,000,000'],
  ['honeybee', 'Honeybee', '15,000,000'],
  ['golf-ball', 'Golf ball', '42,670,000'],
  ['apple', 'Apple', '80,000,000'],
  ['human-hand', 'Human hand', '190,000,000'],
  ['basketball', 'Basketball', '240,000,000'],
  ['bicycle', 'Bicycle', '1.75 × 10^9'],
  ['car', 'Car', '4.5 × 10^9'],
  ['giraffe', 'Giraffe', '5.5 × 10^9'],
  ['blue-whale', 'Blue whale', '3.0 × 10^10'],
  ['statue-of-liberty', 'Statue of Liberty', '9.3 × 10^10'],
  ['great-pyramid-of-giza', 'Great Pyramid of Giza', '1.39 × 10^11'],
  ['eiffel-tower', 'Eiffel Tower', '3.3 × 10^11'],
  ['burj-khalifa', 'Burj Khalifa', '8.28 × 10^11'],
  ['golden-gate-bridge', 'Golden Gate Bridge', '2.74 × 10^12'],
  ['mount-everest', 'Mount Everest', '8.85 × 10^12'],
  ['grand-canyon', 'Grand Canyon', '4.46 × 10^14'],
  ['great-barrier-reef', 'Great Barrier Reef', '2.3 × 10^15'],
  ['the-moon', 'The Moon', '3.47 × 10^15'],
  ['asia', 'Asia', '9.6 × 10^15'],
  ['earth', 'Earth', '1.27 × 10^16'],
  ['jupiter', 'Jupiter', '1.40 × 10^17'],
  ['saturn-rings', 'Saturn rings', '2.7 × 10^17'],
  ['the-sun', 'The Sun', '1.39 × 10^18'],
  ['betelgeuse', 'Betelgeuse', '1.06 × 10^21'],
  ['m87-black-hole', 'M87* black hole', '3.8 × 10^22'],
  ['pillars-of-creation', 'Pillars of Creation', '3.8 × 10^25'],
  ['orion-nebula', 'Orion Nebula', '2.3 × 10^26'],
  ['large-magellanic-cloud', 'Large Magellanic Cloud', '3.0 × 10^29'],
  ['andromeda-galaxy', 'Andromeda galaxy', '1.4 × 10^30'],
  ['coma-cluster', 'Coma cluster of galaxies', '1.9 × 10^32'],
];

function parseSize(s) {
  const m = s.match(/^([\d.]+) × 10\^(-?\d+)$/);
  return m ? parseFloat(m[1]) * Math.pow(10, +m[2]) : parseFloat(s.replace(/,/g, ''));
}

const ITEMS = ITEM_DATA.map(([slug, name, size], i) => {
  const value = parseSize(size);
  return { i, slug, name: name.toUpperCase(), size, value, log: Math.log10(value), small: null, big: null, real: false };
});
const N = ITEMS.length;
