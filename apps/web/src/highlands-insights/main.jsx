import React from 'react';
import { createRoot } from 'react-dom/client';
import HighlandsInsights from './HighlandsInsights.jsx';
import './highlands.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><HighlandsInsights /></React.StrictMode>
);
