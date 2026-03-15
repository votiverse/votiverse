/**
 * Participant pools per assembly.
 *
 * Cross-assembly participants (same name appears in multiple assemblies):
 *   Sofia Reyes   — osc, youth
 *   Marcus Chen   — osc, municipal
 *   Priya Sharma  — municipal, youth
 *   James Okafor  — municipal, board
 */

export const PARTICIPANTS: Record<string, string[]> = {
  greenfield: [
    "Elena Vasquez",
    "Thomas Wright",
    "Amara Johnson",
    "Hiroshi Tanaka",
    "Claire Dubois",
    "Samuel Okonkwo",
    "Fatima Al-Hassan",
    "Robert Kim",
    "Linda Muller",
    "Yuki Nakamura",
    "David Petrov",
    "Ingrid Svensson",
  ],

  osc: [
    "Sofia Reyes",
    "Marcus Chen",
    "Anika Patel",
    "Leo Fernandez",
    "Mei-Ling Wu",
    "Jordan Blake",
    "Chiara Rossi",
    "Kai Andersen",
    "Zara Ibrahim",
    "Tyler Nguyen",
    "Rina Kurosawa",
    "Stefan Kovac",
    "Nadia Boutros",
    "Oscar Lindgren",
    "Tanya Volkov",
  ],

  municipal: [
    "Marcus Chen",
    "Priya Sharma",
    "James Okafor",
    "Carmen Delgado",
    "Antoine Lefebvre",
    "Nkechi Adeyemi",
    "Mikhail Petrov",
    "Sunita Rao",
    "Benjamin Archer",
    "Hana Yokota",
    "Kwame Mensah",
    "Isabel Cruz",
    "Omar Hadid",
    "Fiona MacLeod",
    "Diego Morales",
    "Ayesha Khan",
    "Lars Johansson",
    "Gabriela Santos",
  ],

  youth: [
    "Sofia Reyes",
    "Priya Sharma",
    "Liam Torres",
    "Aisha Moyo",
    "Jin Park",
    "Chloe Beaumont",
    "Tariq Hassan",
    "Nina Kowalski",
    "Ravi Gupta",
    "Emilia Strand",
  ],

  board: [
    "James Okafor",
    "Victoria Harrington",
    "Robert Blackwell",
    "Catherine Zhao",
    "William Thornton",
    "Margaret Ashworth",
    "David Greenfield",
    "Elizabeth Fairfax",
  ],
};
