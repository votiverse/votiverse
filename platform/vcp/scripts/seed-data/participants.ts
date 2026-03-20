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
