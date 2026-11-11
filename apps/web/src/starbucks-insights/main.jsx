import React from 'react';
import { createRoot } from 'react-dom/client';
import StarbucksInsights from './StarbucksInsights.jsx';
import './starbucks.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><StarbucksInsights /></React.StrictMode>
);
