/**
 * Participant pools per assembly.
 *
 * Cross-assembly participants (same name appears in multiple assemblies):
 *   Sofia Reyes   — osc, youth
 *   Marcus Chen   — osc, municipal
 *   Priya Sharma  — municipal, youth
 *   James Okafor  — municipal, board
 *   Elena Vasquez — greenfield, maple
 *   Thomas Wright — greenfield, maple
 *   Amara Johnson — greenfield, maple
 *   Marcus Chen   — osc, municipal, maple
 *   Sofia Reyes   — osc, youth, maple (invited member)
 *   Kai Andersen  — osc, maple
 *
 * Non-cross-assembly: riverside (all 12 participants are unique to this assembly)
 */

/**
 * Gender presentation hints for avatar generation.
 * Used by the backend seed to set DiceBear parameters (e.g. facialHairProbability).
 * "m" = masculine, "f" = feminine. Only affects avatar appearance, not governance.
 */
export const PARTICIPANT_GENDER: Record<string, "m" | "f"> = {
  // greenfield
  "Elena Vasquez": "f",
  "Thomas Wright": "m",
  "Amara Johnson": "f",
  "Hiroshi Tanaka": "m",
  "Claire Dubois": "f",
  "Samuel Okonkwo": "m",
  "Fatima Al-Hassan": "f",
  "Robert Kim": "m",
  "Linda Muller": "f",
  "Yuki Nakamura": "f",
  "David Petrov": "m",
  "Ingrid Svensson": "f",
  // osc
  "Sofia Reyes": "f",
  "Marcus Chen": "m",
  "Anika Patel": "f",
  "Leo Fernandez": "m",
  "Mei-Ling Wu": "f",
  "Jordan Blake": "m",
  "Chiara Rossi": "f",
  "Kai Andersen": "m",
  "Zara Ibrahim": "f",
  "Tyler Nguyen": "m",
  "Rina Kurosawa": "f",
  "Stefan Kovac": "m",
  "Nadia Boutros": "f",
  "Oscar Lindgren": "m",
  "Tanya Volkov": "f",
  // municipal
  "Priya Sharma": "f",
  "James Okafor": "m",
  "Carmen Delgado": "f",
  "Antoine Lefebvre": "m",
  "Nkechi Adeyemi": "f",
  "Mikhail Petrov": "m",
  "Sunita Rao": "f",
  "Benjamin Archer": "m",
  "Hana Yokota": "f",
  "Kwame Mensah": "m",
  "Isabel Cruz": "f",
  "Omar Hadid": "m",
  "Fiona MacLeod": "f",
  "Diego Morales": "m",
  "Ayesha Khan": "f",
  "Lars Johansson": "m",
  "Gabriela Santos": "f",
  // youth
  "Liam Torres": "m",
  "Aisha Moyo": "f",
  "Jin Park": "m",
  "Chloe Beaumont": "f",
  "Tariq Hassan": "m",
  "Nina Kowalski": "f",
  "Ravi Gupta": "m",
  "Emilia Strand": "f",
  // board
  "Victoria Harrington": "f",
  "Robert Blackwell": "m",
  "Catherine Zhao": "f",
  "William Thornton": "m",
  "Margaret Ashworth": "f",
  "David Greenfield": "m",
  "Elizabeth Fairfax": "f",
  // riverside
  "Diana Reyes": "f",
  "Sam Okonkwo": "m",
  "Leah Chen": "f",
  "Marco Rossi": "m",
  "Priya Nair": "f",
  "Tomás Herrera": "m",
  "Janet Kim": "f",
  "Kwesi Appiah": "m",
  "Fatima Al-Rashid": "f",
  "David Park": "m",
  "Nina Volkov": "f",
  "Rashid Khan": "m",
};

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

  maple: [
    "Elena Vasquez",      // board president, owner
    "Marcus Chen",        // treasurer, writes proposals
    "Thomas Wright",      // board member
    "Amara Johnson",      // board member
    "Kai Andersen",       // skeptical owner, writes community notes
    "Sofia Reyes",        // new owner, invited via link
  ],

  // No cross-assembly participants
  riverside: [
    "Diana Reyes",        // center director, owner
    "Sam Okonkwo",        // finance committee chair
    "Leah Chen",          // youth programs coordinator
    "Marco Rossi",        // retired contractor, facilities expert
    "Priya Nair",         // busy parent, uses topic delegation
    "Tomás Herrera",      // newer member, learning the system
    "Janet Kim",          // regular member
    "Kwesi Appiah",       // regular member
    "Fatima Al-Rashid",   // adult programs volunteer
    "David Park",         // parent
    "Nina Volkov",        // fitness instructor
    "Rashid Khan",        // accountant
  ],
};
