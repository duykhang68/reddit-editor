import React from 'react';
import {createRoot} from 'react-dom/client';
import Writer from './Writer.jsx';
import './writer.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><Writer/></React.StrictMode>);