import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary.jsx';
import logoImg from './components/Logo/logo.png';
import './index.css';

/**
 * WHAT: Sets the browser tab icon to the ReeferON logo.
 * WHY: Users see the brand in the tab on dev and production builds.
 * HOW: Creates or updates <link rel="icon"> tags in document.head.
 */
function applyBrandFavicon(href) {
  const setLink = (rel, id) => {
    let link = document.getElementById(id) || document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = href;
  };
  setLink('icon', 'app-favicon');
  setLink('apple-touch-icon', 'app-apple-icon');
}

applyBrandFavicon(logoImg);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
