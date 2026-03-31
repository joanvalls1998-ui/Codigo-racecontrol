export default async function handler(req, res) {
  const drivers = [
    {
      pos: 1,
      number: "12",
      name: "Kimi Antonelli",
      team: "Mercedes",
      points: 72,
      colorClass: "mercedes",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/antonelli"
    },
    {
      pos: 2,
      number: "63",
      name: "George Russell",
      team: "Mercedes",
      points: 63,
      colorClass: "mercedes",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/russell"
    },
    {
      pos: 3,
      number: "16",
      name: "Charles Leclerc",
      team: "Ferrari",
      points: 49,
      colorClass: "ferrari",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/leclerc"
    },
    {
      pos: 4,
      number: "44",
      name: "Lewis Hamilton",
      team: "Ferrari",
      points: 41,
      colorClass: "ferrari",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/hamilton"
    },
    {
      pos: 5,
      number: "1",
      name: "Lando Norris",
      team: "McLaren",
      points: 25,
      colorClass: "mclaren",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/norris"
    },
    {
      pos: 6,
      number: "81",
      name: "Oscar Piastri",
      team: "McLaren",
      points: 21,
      colorClass: "mclaren",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/piastri"
    },
    {
      pos: 7,
      number: "87",
      name: "Oliver Bearman",
      team: "Haas",
      points: 17,
      colorClass: "haas",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/bearman"
    },
    {
      pos: 8,
      number: "10",
      name: "Pierre Gasly",
      team: "Alpine",
      points: 15,
      colorClass: "alpine",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/gasly"
    },
    {
      pos: 9,
      number: "3",
      name: "Max Verstappen",
      team: "Red Bull",
      points: 12,
      colorClass: "redbull",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/verstappen"
    },
    {
      pos: 10,
      number: "30",
      name: "Liam Lawson",
      team: "Racing Bulls",
      points: 10,
      colorClass: "rb",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/lawson"
    },
    {
      pos: 11,
      number: "41",
      name: "Arvid Lindblad",
      team: "Racing Bulls",
      points: 4,
      colorClass: "rb",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/lindblad"
    },
    {
      pos: 12,
      number: "6",
      name: "Isack Hadjar",
      team: "Red Bull",
      points: 4,
      colorClass: "redbull",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/hadjar"
    },
    {
      pos: 13,
      number: "5",
      name: "Gabriel Bortoleto",
      team: "Audi",
      points: 2,
      colorClass: "audi",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/bortoleto"
    },
    {
      pos: 14,
      number: "55",
      name: "Carlos Sainz",
      team: "Williams",
      points: 2,
      colorClass: "williams",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/sainz"
    },
    {
      pos: 15,
      number: "31",
      name: "Esteban Ocon",
      team: "Haas",
      points: 1,
      colorClass: "haas",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/ocon"
    },
    {
      pos: 16,
      number: "43",
      name: "Franco Colapinto",
      team: "Alpine",
      points: 1,
      colorClass: "alpine",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/colapinto"
    },
    {
      pos: 17,
      number: "27",
      name: "Nico Hulkenberg",
      team: "Audi",
      points: 0,
      colorClass: "audi",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/hulkenberg"
    },
    {
      pos: 18,
      number: "23",
      name: "Alexander Albon",
      team: "Williams",
      points: 0,
      colorClass: "williams",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/albon"
    },
    {
      pos: 19,
      number: "77",
      name: "Valtteri Bottas",
      team: "Cadillac",
      points: 0,
      colorClass: "cadillac",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/bottas"
    },
    {
      pos: 20,
      number: "11",
      name: "Sergio Perez",
      team: "Cadillac",
      points: 0,
      colorClass: "cadillac",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/perez"
    },
    {
      pos: 21,
      number: "14",
      name: "Fernando Alonso",
      team: "Aston Martin",
      points: 0,
      colorClass: "aston",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/alonso"
    },
    {
      pos: 22,
      number: "18",
      name: "Lance Stroll",
      team: "Aston Martin",
      points: 0,
      colorClass: "aston",
      image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/stroll"
    }
  ];

  const teams = [
    {
      pos: 1,
      team: "Mercedes",
      drivers: "Russell · Antonelli",
      points: 135,
      colorClass: "mercedes"
    },
    {
      pos: 2,
      team: "Ferrari",
      drivers: "Leclerc · Hamilton",
      points: 90,
      colorClass: "ferrari"
    },
    {
      pos: 3,
      team: "McLaren",
      drivers: "Norris · Piastri",
      points: 46,
      colorClass: "mclaren"
    },
    {
      pos: 4,
      team: "Haas",
      drivers: "Ocon · Bearman",
      points: 18,
      colorClass: "haas"
    },
    {
      pos: 5,
      team: "Alpine",
      drivers: "Gasly · Colapinto",
      points: 16,
      colorClass: "alpine"
    },
    {
      pos: 6,
      team: "Red Bull",
      drivers: "Verstappen · Hadjar",
      points: 16,
      colorClass: "redbull"
    },
    {
      pos: 7,
      team: "Racing Bulls",
      drivers: "Lawson · Lindblad",
      points: 14,
      colorClass: "rb"
    },
    {
      pos: 8,
      team: "Audi",
      drivers: "Hülkenberg · Bortoleto",
      points: 2,
      colorClass: "audi"
    },
    {
      pos: 9,
      team: "Williams",
      drivers: "Sainz · Albon",
      points: 2,
      colorClass: "williams"
    },
    {
      pos: 10,
      team: "Cadillac",
      drivers: "Perez · Bottas",
      points: 0,
      colorClass: "cadillac"
    },
    {
      pos: 11,
      team: "Aston Martin",
      drivers: "Alonso · Stroll",
      points: 0,
      colorClass: "aston"
    }
  ];

  return res.status(200).json({
    updatedAt: new Date().toISOString(),
    drivers,
    teams
  });
}