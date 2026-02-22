import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AccessibilityProvider } from './context/accessibility-context';
import { AuthProvider } from './context/auth-context';
import { SolanaWalletProvider } from './providers/solana-wallet-provider';

function App() {
  return (
    <SolanaWalletProvider>
      <AuthProvider>
        <AccessibilityProvider>
          <RouterProvider router={router} />
        </AccessibilityProvider>
      </AuthProvider>
    </SolanaWalletProvider>
  );
}

export default App;