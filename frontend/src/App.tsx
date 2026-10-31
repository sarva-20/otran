import { Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Analysis } from '@/pages/Analysis'
import { Home } from '@/pages/Home'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="analysis/:id" element={<Analysis />} />
        <Route path="*" element={<p className="py-20 text-center text-muted-foreground">Page not found.</p>} />
      </Route>
    </Routes>
  )
}
