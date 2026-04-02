import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Toast from 'vue-toastification';
import 'vue-toastification/dist/index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './style.css';
import App from './App.vue';
import { router } from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(Toast, {
  position: 'top-right',
  timeout: 4000,
  closeOnClick: true,
  pauseOnHover: true,
});

app.config.errorHandler = (err, _instance, _info) => {
  const toast = app.config.globalProperties.$toast as
    | { error: (msg: string) => void }
    | undefined;
  if (toast) {
    toast.error('An unexpected error occurred.');
  }
  // eslint-disable-next-line no-console
  console.error(err);
};

app.mount('#app');

