(function setupHeroRegistry(globalScope) {
  const fallbackHero = "assets/heroes/fallback/default-hero.svg";

  // Mapping preparado para heroes visuales (coche + casco + identidad), sin retratos realistas.
  // Clave: nombre normalizado en minúsculas.
  const heroByDriver = {
    "max verstappen": "assets/heroes/drivers/driver-placeholder.svg",
    "lando norris": "assets/heroes/drivers/driver-placeholder.svg",
    "charles leclerc": "assets/heroes/drivers/driver-placeholder.svg"
  };

  const heroByTeam = {
    "red bull": "assets/heroes/teams/team-placeholder.svg",
    "mclaren": "assets/heroes/teams/team-placeholder.svg",
    "ferrari": "assets/heroes/teams/team-placeholder.svg",
    "mercedes": "assets/heroes/teams/team-placeholder.svg"
  };

  function normalizeKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function resolveHeroImage({ driverName = "", teamName = "" } = {}) {
    const normalizedDriver = normalizeKey(driverName);
    const normalizedTeam = normalizeKey(teamName);

    if (normalizedDriver && heroByDriver[normalizedDriver]) {
      return { src: heroByDriver[normalizedDriver], source: "driver" };
    }

    if (normalizedTeam && heroByTeam[normalizedTeam]) {
      return { src: heroByTeam[normalizedTeam], source: "team" };
    }

    return { src: fallbackHero, source: "fallback" };
  }

  function resolveFavoriteHero(favorite) {
    if (!favorite || typeof favorite !== "object") {
      return { src: fallbackHero, source: "fallback" };
    }

    const driverName = favorite.type === "driver" ? favorite.name : "";
    const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
    return resolveHeroImage({ driverName, teamName });
  }

  globalScope.HERO_IMAGES = {
    heroByDriver,
    heroByTeam,
    fallbackHero,
    resolveHeroImage,
    resolveFavoriteHero
  };
})(window);
