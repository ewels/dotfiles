#
# =============================================================================
# Generic bash helper functions / customisation
# Kinda messy, mostly used for personal backup and sharing between machines
# Use at your own risk!
# Phil Ewels - @ewels
# =============================================================================
#
# Recommendation: Keep this git repo somewhere sensible and then just
# source this file in your home directory .bashrc / .bash_profile
#


# Basic Function Aliases
alias ls='ls -p' # Adds slash after directory names
alias ll='ls -lhtr' # Human readable filesizes by edit time
alias lsd='ls -l | grep ^d' # List directories only
alias lol="ll | lolcat" # Taste the rainbow. Requires `pip install lolcat`
alias du='du -kh' # Human readable directory filesizes
alias df='df -kTh' # Human readable drive sizes
alias untar='tar -xvzf' # Easy untar
alias dos2unix="perl -pe 's/\r\n|\n|\r/\n/g'" # Convert line endings
alias docker_delete_all='docker rm $(docker ps -a -q); docker rmi $(docker images -q)' # Delete all local Docker images
alias cat='bat --theme TwoDark' # Use the awesome `bat` instead of `cat`. Requires `brew install bat`
alias firefox='open -a /Applications/Firefox.app'
alias chrome='open -a "/Applications/Google Chrome.app" '
alias seqmonk='open -n -a seqmonk'
alias typora='open -a typora'
alias cd..='cd ../'
alias ..='cd ../'
alias ...='cd ../../'
alias ....='cd ../../../'
mkcd (){ mkdir -p -- "$1" && cd -P -- "$1"; }

# Git shorthand
alias gl="git log --graph --pretty=format:'%Cred%h%Creset %an: %s - %Creset %C(yellow)%d%Creset %Cgreen(%cr)%Creset' --abbrev-commit --date=relative"
alias gs='git status -sb' # Succinct git status
alias gb="git checkout -b " # Checkout a new branch
alias gbranch="git checkout -b " # Checkout a new branch
alias gclean="git branch --merged | egrep -v \"(^\*|master|dev|TEMPLATE)\" | xargs git branch -d && git fetch origin --prune" # Clean local merged branches

# Run bash history through fuzzy finder (fzf) - https://github.com/junegunn/fzf
alias h="eval $(history -w /dev/stdout | fzf)"

# Helper function to pull + push updates from fork and upstream and clean old branches
function gupdate(){
  local upstream_branch="${1:dev}"
  git pull
  git pull upstream "$upstream_branch"
  git push
  gclean
  git fetch upstream --prune
}

# Helper function to list all PRs for a repo using gh cli, but list additions, deletions and files changed
# Requires: https://cli.github.com/ and https://stedolan.github.io/jq/
function ghprs(){
  echo -e "PR\t+\t-\tFiles"
  for pr in $(gh api repos/:owner/:repo/pulls | jq .[].number); do
    gh api repos/:owner/:repo/pulls/${pr} | jq .number,.additions,.deletions,.changed_files | tr '\n' \\t
    echo ""
  done
}

# brew install git bash-completion
[[ -r "/usr/local/etc/profile.d/bash_completion.sh" ]] && . "/usr/local/etc/profile.d/bash_completion.sh"

# Use delta instead of diff - brew install delta
# https://github.com/dandavison/delta
alias diff="delta -s"

# Safety
# alias rm="rm -i"
alias mv='mv -i'
alias cp='cp -i'

# Stop OSX telling me to use zsh
export BASH_SILENCE_DEPRECATION_WARNING=1

# Bash history stuff
export HISTCONTROL=ignoreboth
export HISTFILESIZE=10000000
export HISTSIZE=10000000
export HISTIGNORE='&:ls:l:la:ll:exit'

# Nice Python exception traces
# https://github.com/Qix-/better-exceptions
export BETTER_EXCEPTIONS=1

# Nice colours in the terminal for OSX
export CLICOLOR=1
export LSCOLORS=GxFxCxDxBxegedabagaced

# Grep options
export GREP_OPTIONS='--color'
export GREP_COLOR='1;31' # green for matches


## Command prompt coloured by git status
function prompt_if_git_dirty(){
  PROMPT=" ❯"
  if STATUS=$(git status -s 2> /dev/null); then
    if [[ -z $STATUS ]] ; then
      # Git is clean - green prompt
      echo -en "\x01\033[0;32m\x02$PROMPT \x01\033[0m\x02"
    else
      # Git is dirty - red prompt
      echo -en "\x01\033[0;31m\x02$PROMPT \x01\033[0m\x02"
    fi
  else
    # Not a git repo - yellow prompt
    echo -en "\x01\033[0;33m\x02$PROMPT \x01\033[0m\x02"
  fi
}
PS1="\$(prompt_if_git_dirty)"


# iTerm function to get current conda environment
# Specify as \(user.condaEnv) in an iTerm2 "Interpolated string" status bar component
function iterm2_print_user_vars() {
  iterm2_set_user_var condaEnv $CONDA_DEFAULT_ENV
}
# To remove the conda environment name prefix:
#   conda config --set env_prompt ''
# To remove iTerm2 shell integration blue arrow:
#   Preferences > Profiles > (your profile) > Terminal > Shell Integration > Turn off "Show mark indicators"

# Ruby renv packaging
if type "rbenv" > /dev/null 2>&1; then
  eval "$(rbenv init -)"
fi

# Homebrew installation of ruby / other stuff
export PATH=/usr/local/bin:$PATH

# Homebrew shell auto-completion
if type brew &>/dev/null; then
  HOMEBREW_PREFIX="$(brew --prefix)"
  if [[ -r "${HOMEBREW_PREFIX}/etc/profile.d/bash_completion.sh" ]]; then
    source "${HOMEBREW_PREFIX}/etc/profile.d/bash_completion.sh"
  else
    for COMPLETION in "${HOMEBREW_PREFIX}/etc/bash_completion.d/"*; do
      [[ -r "$COMPLETION" ]] && source "$COMPLETION"
    done
  fi
fi


# One command to extract them all
extract () {
  if [ $# -ne 1 ]
  then
    echo "Error: No file specified."
    return 1
  fi
  if [ -f $1 ] ; then
    case $1 in
      *.tar.bz2) tar xvjf $1   ;;
      *.tar.gz)  tar xvzf $1   ;;
      *.bz2)     bunzip2 $1    ;;
      *.rar)     unrar x $1    ;;
      *.gz)      gunzip $1     ;;
      *.tar)     tar xvf $1    ;;
      *.tbz2)    tar xvjf $1   ;;
      *.tgz)     tar xvzf $1   ;;
      *.zip)     unzip $1      ;;
      *.Z)       uncompress $1 ;;
      *.7z)      7z x $1       ;;
      *)         echo "'$1' cannot be extracted via extract" ;;
    esac
  else
    echo "'$1' is not a valid file"
  fi
}


# From iTerm for remote shell integration
test -e "${HOME}/.iterm2_shell_integration.bash" && source "${HOME}/.iterm2_shell_integration.bash"
