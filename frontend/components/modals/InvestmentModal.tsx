isOpen: boolean
  onClose: () => void
  userMarkee?: Markee | null
  onSuccess?: () => void
}

type ModalTab = 'create' | 'addFunds' | 'updateMessage'

export function InvestmentModal({ isOpen, onClose, userMarkee, onSuccess }: InvestmentModalProps) {
  const { address, isConnected, chain } = useAccount()
  const [activeTab, setActiveTab] = useState<ModalTab>('create')
  const [message, setMessage] = useState('')
@@ -58,20 +57,18 @@ export function InvestmentModal({ isOpen, onClose, userMarkee, onSuccess }: Inve
    setError(null)
  }, [userMarkee, isOpen])

  // Reset state and trigger refresh when transaction succeeds
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        setMessage('')
        setAmount('')
        setError(null)
        if (onSuccess) {
          onSuccess()
        }
        onClose()
      }, 2000)

    }
  }, [isSuccess, onClose, onSuccess])

  const handleCreateMarkee = async () => {
    if (!strategyAddress || !chain) {
@@ -373,7 +370,7 @@ export function InvestmentModal({ isOpen, onClose, userMarkee, onSuccess }: Inve
                  <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-medium text-green-900">Transaction successful!</p>
                    <p className="text-xs text-green-700 mt-1">Refreshing leaderboard...</p>
                  </div>
                </div>
              )}
