#!/usr/bin/env bash
# Runner de SQL para o agente de testes. A base e partilhada e a massa historica e irreponivel:
# as guardas daqui sao contra o erro distraido, nao contra ma fe. A disciplina real esta escrita
# no enunciado do agente.
#
# Credenciais nunca entram no repositorio. Vem do ambiente, tipicamente de perfis/bd.env:
#   CCMSNS_BD_LIGACAO   'UTILIZADOR/senha@//10.205.2.100:1521/ACCQUA'
#   CCMSNS_BD_CONTENTOR nome do contentor com o cliente sqlplus (omissao: ccmsns-oracle)
#   CCMSNS_BD_MARCADOR  marcador que o SQL de escrita tem de conter
set -uo pipefail

modo="${1:-}"
sql="${2:-}"

if [ -z "$modo" ] || [ -z "$sql" ]; then
  echo "uso: bd.sh consultar \"<SELECT ...>\" | bd.sh escrever \"<INSERT/UPDATE/DELETE ...>\"" >&2
  exit 2
fi

if [ -z "${CCMSNS_BD_LIGACAO:-}" ]; then
  echo "falta CCMSNS_BD_LIGACAO no ambiente (ver perfis/bd.env.exemplo)" >&2
  exit 3
fi

maiusculas="$(printf '%s' "$sql" | tr '[:lower:]' '[:upper:]')"

case "$maiusculas" in
  *DROP*|*TRUNCATE*|*ALTER*)
    echo "recusado: DROP, TRUNCATE e ALTER nao passam por aqui" >&2
    exit 2
    ;;
esac

case "$modo" in
  consultar)
    case "$maiusculas" in
      SELECT\ *|WITH\ *) ;;
      *) echo "recusado: consultar so aceita SELECT ou WITH" >&2; exit 2 ;;
    esac
    case "$maiusculas" in
      *INSERT\ *|*UPDATE\ *|*DELETE\ *|*MERGE\ *)
        echo "recusado: consultar so aceita SELECT, e este tem DML colado" >&2; exit 2 ;;
    esac
    ;;
  escrever)
    marcador="${CCMSNS_BD_MARCADOR:-}"
    if [ -z "$marcador" ]; then
      echo "falta CCMSNS_BD_MARCADOR: escrever sem marcador deixa massa impossivel de limpar" >&2
      exit 3
    fi
    case "$sql" in
      *"$marcador"*) ;;
      *) echo "recusado: o SQL de escrita tem de conter o marcador $marcador" >&2; exit 2 ;;
    esac
    ;;
  *)
    echo "modo desconhecido: $modo (esperado consultar ou escrever)" >&2
    exit 2
    ;;
esac

contentor="${CCMSNS_BD_CONTENTOR:-ccmsns-oracle}"

# Uma coluna so, concatenada por quem escreve a query: com varias colunas o sqlplus parte as
# linhas e a saida fica ilegivel para quem a le a seguir.
#
# `/nolog` e depois `CONNECT`, e nao a ligacao como argumento do sqlplus: o argumento de linha
# de comando NAO honra as aspas da senha, e uma senha com '@' dentro (a de dev tem duas) e
# partida no primeiro '@', dando ORA-01005 null password. O comando CONNECT honra-as.
#
# A ligacao vai como argumento posicional e nao interpolada no formato do printf: a senha
# contem aspas, '!' e '#', e qualquer um deles interpolado numa string da shell muda de
# significado.
docker exec -i "$contentor" bash -lc \
  'printf "CONNECT %s\nSET PAGESIZE 200 LINESIZE 400 FEEDBACK ON\n%s;\nCOMMIT;\nEXIT\n" "$1" "$2" | sqlplus -S /nolog' \
  _ "$CCMSNS_BD_LIGACAO" "$sql"
