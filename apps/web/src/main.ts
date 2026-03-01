import { createApp } from "vue";
import PrimeVue from "primevue/config";
import ConfirmationService from "primevue/confirmationservice";
import Aura from "@primeuix/themes/aura";
import App from "./App.vue";
import "./styles.css";
import "primeicons/primeicons.css";

createApp(App)
  .use(PrimeVue, {
    theme: {
      preset: Aura
    }
  })
  .use(ConfirmationService)
  .mount("#app");
