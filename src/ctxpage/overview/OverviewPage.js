import { getOption, setOption } from "../conf-options.js";
import { createDOM } from "../../ui/dom.js";
import { getLogger } from "../../platform/logger.js";
import OGBIData from "../../store/OGBIData.js";

class OverviewPage {
  logger;

  constructor() {
    this.logger = getLogger("OverviewPage");
  }

  // `planet` is the caller's element and has to be handed in: it used to be read off
  // the enclosing scope, where it does not exist, so every call threw a ReferenceError
  // - swallowed by MakePrettierOverview's catch on the initial call, uncaught on the
  // toggle click.
  #updatePlanetOverviewDisplay(planet, toggle) {
    const optionName = `overview_display_planet_details`;
    const attributeName = `details-active`;

    // get the current display status
    const display = getOption(optionName);

    if (toggle) {
      const options = OGBIData.options;

      //toggle the display
      planet.setAttribute(attributeName, !display);

      //save the display preference
      setOption(optionName, !display);
      options[optionName] = !display;
      OGBIData.options = options;
    } else {
      planet.setAttribute(attributeName, display);
    }
  }

  MakePrettierOverview(currentPage) {
    if (currentPage !== "overview") return;

    try {
      const planet = document.querySelector("#overviewcomponent #planet");
      const detailWrapper = planet.querySelector("#detailWrapper");

      // create the toggle planet details button
      const togglePlanetDataButton = createDOM("div", { class: "togglePlanetDetails" });
      togglePlanetDataButton.addEventListener("click", () => {
        this.#updatePlanetOverviewDisplay(planet, true);
      });

      // add the toggle planet details button to the header
      detailWrapper.querySelector("#header_text").appendChild(togglePlanetDataButton);

      // init the display of the planet details
      this.#updatePlanetOverviewDisplay(planet, false);

      const planetOptions = detailWrapper.querySelector("#planetOptions");
      if (planetOptions) detailWrapper.appendChild(planetOptions);
    } catch (e) {
      // it would be a shame if a UI error break the game...
      this.logger.error(e);
    }
  }
}

export default OverviewPage;
