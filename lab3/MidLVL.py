# ==========================================
# 2. СРЕДНИЙ УРОВЕНЬ: Вариант 7 (BankAccount)
# ==========================================
class BankAccount:
    def __init__(self, owner: str, initial_balance: float = 0.0):
        self.owner = owner
        self._balance = initial_balance  # Закрытый атрибут (инкапсуляция)

    def deposit(self, amount: float):
        """Пополнение баланса"""
        if amount > 0:
            self._balance += amount
            print(f"[{self.owner}] Баланс пополнен на {amount} тг. Текущий: {self._balance} тг.")
        else:
            print("Сумма пополнения должна быть больше нуля.")

    def withdraw(self, amount: float):
        """Снятие средств с проверкой"""
        if amount > self._balance:
            print(f"[{self.owner}] Ошибка: Недостаточно средств на счете!")
        elif amount <= 0:
            print("Сумма снятия должна быть больше нуля.")
        else:
            self._balance -= amount
            print(f"[{self.owner}] Снято {amount} тг. Остаток: {self._balance} тг.")

    def get_balance(self):
        """Получение текущего баланса"""
        return self._balance
