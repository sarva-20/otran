import { Link, Route, Routes } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Analysis } from '@/pages/Analysis'
import { Home } from '@/pages/Home'

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <FileQuestion className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/">
        <Button size="sm">Back to Home</Button>
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="analysis/:id" element={<Analysis />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
