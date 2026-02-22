import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AccessibilityProvider } from './context/accessibility-context';

function App() {
  return (
    <AccessibilityProvider>
      <RouterProvider router={router} />
    </AccessibilityProvider>
  );
}

export default App;