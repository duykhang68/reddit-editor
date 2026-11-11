import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './style.css';
import './article.css';
import './editor-kit.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
