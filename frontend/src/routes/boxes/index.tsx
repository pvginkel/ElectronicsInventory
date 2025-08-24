import { createFileRoute } from '@tanstack/react-router'
import { BoxList } from '@/components/boxes/box-list'

export const Route = createFileRoute('/boxes/')({
  component: Boxes,
})

function Boxes() {
  return <BoxList />
}