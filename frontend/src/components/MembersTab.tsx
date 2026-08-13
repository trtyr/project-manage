import { useState } from 'react'
import {
  Typography,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  App,
  Space,
  Empty,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { peopleApi } from '../api'
import type { Person, CreatePerson } from '../types'

const { Title, Text } = Typography

// One shared role template for both team and client people — moving a person
// across sides carries `role` verbatim, no conversion.
const ROLE_SUGGESTIONS = [
  '项目经理',
  '项目负责人',
  '架构师',
  '运维工程师',
  '项目工程师',
  '决策者',
  '技术评估人',
  '影响者',
  '其他',
]

type Side = 'team' | 'client'

const SIDE_LABEL: Record<Side, string> = {
  team: '团队成员',
  client: '客户方人员',
}

interface RoleSelectProps {
  value?: string
  onChange?: (role: string) => void
}

function RoleSelect({ value, onChange }: RoleSelectProps) {
  return (
    <Select
      mode="tags"
      value={value ? [value] : []}
      maxCount={1}
      options={ROLE_SUGGESTIONS.map((role) => ({ label: role, value: role }))}
      placeholder="选择或自由填写角色"
      onChange={(selected) => onChange?.(selected[selected.length - 1] ?? '')}
    />
  )
}

// --- drag-and-drop plumbing ---

/** A sortable entry is addressed as `<side>:<uuid>` so a single DndContext can
 * tell the two columns apart and detect same-column reorder vs cross-column
 * flip. */
function itemId(side: Side, id: string) {
  return `${side}:${id}`
}

function containerOf(item: string): Side | null {
  if (item.startsWith('team:') || item === 'team-droppable') return 'team'
  if (item.startsWith('client:') || item === 'client-droppable') return 'client'
  return null
}

function DroppableArea({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id })
  return <div ref={setNodeRef}>{children}</div>
}

interface SortableCardProps {
  itemId: string
  children: React.ReactNode
}

function SortableCard({ itemId, children }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: itemId,
  })
  // Only the drag transform/opacity stay inline (dynamic, from dnd-kit). The
  // static card surface / border / hover live in the `.member-card` CSS class
  // so they follow the design-system tokens (and adapt to dark mode).
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} className="member-card" style={style}>
      <span className="member-card__handle" {...attributes} {...listeners}>
        <HolderOutlined />
      </span>
      {children}
    </div>
  )
}

// --- the tab ---

interface Props {
  projectId: string
}

export default function MembersTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [addingSide, setAddingSide] = useState<Side | null>(null)
  const [editPerson, setEditPerson] = useState<Person | null>(null)
  const [form] = Form.useForm()

  const { data: people = [] } = useQuery({
    queryKey: ['people', projectId],
    queryFn: () => peopleApi.listByProject(projectId),
  })
  const teamPeople = people.filter((p) => p.side === 'team')
  const clientPeople = people.filter((p) => p.side === 'client')

  const createMut = useMutation({
    mutationFn: (data: CreatePerson) => peopleApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', projectId] })
      message.success('已添加')
      setAddingSide(null)
      form.resetFields()
    },
  })

  const updateMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof peopleApi.update>[1]
    }) => peopleApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', projectId] })
      message.success('已保存')
      setEditPerson(null)
      form.resetFields()
    },
  })

  const deleteMut = useMutation({
    mutationFn: peopleApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', projectId] })
      message.success('已删除')
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const from = containerOf(activeId)
    const to = containerOf(overId)
    if (!from || !to) return

    const sourceId = activeId.split(':')[1]

    // Same column → reorder that side optimistically, persist the new order.
    if (from === to && activeId !== overId) {
      const overUuid = overId.split(':')[1]
      const list = from === 'team' ? teamPeople : clientPeople
      const oldIndex = list.findIndex((p) => p.id === sourceId)
      const newIndex = list.findIndex((p) => p.id === overUuid)
      if (oldIndex < 0 || newIndex < 0) return
      const reorderedSide = arrayMove(list, oldIndex, newIndex)
      // Rebuild the full people list with this side reordered, keep the other
      // side untouched, so the cache stays consistent.
      const other = from === 'team' ? clientPeople : teamPeople
      const newPeople =
        from === 'team'
          ? [...reorderedSide, ...other]
          : [...other, ...reorderedSide]
      queryClient.setQueryData(['people', projectId], newPeople)
      try {
        await peopleApi.reorder(
          projectId,
          from,
          reorderedSide.map((p) => p.id),
        )
      } catch {
        message.error('排序保存失败，已还原')
        queryClient.invalidateQueries({ queryKey: ['people', projectId] })
      }
      return
    }

    // Cross column → flip side. role carries verbatim (no conversion); refetch
    // both sides since the moved row's side + sort_order change server-side.
    if (from !== to && sourceId) {
      try {
        await peopleApi.flipSide(sourceId)
        queryClient.invalidateQueries({ queryKey: ['people', projectId] })
        message.success('已移动')
      } catch {
        message.error('移动失败')
      }
    }
  }

  function openAdd(side: Side) {
    setAddingSide(side)
    form.resetFields()
  }

  function openEdit(p: Person) {
    setEditPerson(p)
    form.setFieldsValue(p)
  }

  function closeModal() {
    setAddingSide(null)
    setEditPerson(null)
    form.resetFields()
  }

  const modalOpen = addingSide !== null || !!editPerson
  const modalSide: Side = editPerson
    ? (editPerson.side as Side)
    : (addingSide ?? 'team')

  function renderColumn(side: Side) {
    const list = side === 'team' ? teamPeople : clientPeople
    return (
      <div style={{ marginBottom: 32, flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            {SIDE_LABEL[side]}
          </Title>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => openAdd(side)}
          >
            添加
          </Button>
        </div>
        <DroppableArea id={`${side}-droppable`}>
          <SortableContext
            items={list.map((p) => itemId(side, p.id))}
            strategy={verticalListSortingStrategy}
          >
            {list.length === 0 ? (
              <Empty
                description={`还没有${SIDE_LABEL[side]}`}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              list.map((p) => (
                <SortableCard key={p.id} itemId={itemId(side, p.id)}>
                  <Text strong style={{ flex: '0 0 auto' }}>
                    {p.name}
                  </Text>
                  <Text type="secondary">{p.role || '-'}</Text>
                  <Text
                    type="secondary"
                    style={{ flex: 1, overflow: 'hidden' }}
                    ellipsis
                  >
                    {p.notes || ''}
                  </Text>
                  <Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEdit(p)}
                    />
                    <Popconfirm
                      title="删除？"
                      onConfirm={() => deleteMut.mutate(p.id)}
                    >
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                      />
                    </Popconfirm>
                  </Space>
                </SortableCard>
              ))
            )}
          </SortableContext>
        </DroppableArea>
      </div>
    )
  }

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {renderColumn('team')}
          {renderColumn('client')}
        </div>
      </DndContext>

      <Modal
        title={
          editPerson
            ? `编辑${SIDE_LABEL[modalSide]}`
            : `添加${SIDE_LABEL[modalSide]}`
        }
        open={modalOpen}
        onCancel={closeModal}
        onOk={() =>
          form.validateFields().then((v) => {
            if (editPerson) {
              updateMut.mutate({ id: editPerson.id, data: v })
            } else {
              createMut.mutate({ ...v, side: modalSide })
            }
          })
        }
        confirmLoading={createMut.isPending || updateMut.isPending}
        width={440}
        okText={editPerson ? '保存' : '添加'}
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <RoleSelect />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
